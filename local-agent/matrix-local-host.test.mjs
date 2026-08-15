import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerRuntime, runHost, stableNodeId } from './matrix-local-host.mjs';

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-local-host-'));
const runtime = {
  hardware: { hostname: 'test', cpu_threads: 8, total_memory_mb: 16000, gpus: [] },
  servers: [], resources: [], cost_confirmed_zero: true, external_network_used: false
};
let registrationBody = null;
const registered = await registerRuntime({ siteUrl: 'https://matrix.invalid', adminToken: 'a'.repeat(32), nodeId: stableNodeId() }, runtime, {
  resourcePressure: {
    level: 'low', can_accept_local_jobs: true, can_run_benchmarks: true,
    external_compute_preferred: false, free_memory_mb: 7000, free_memory_percent: 43.8,
    assessed_at: '2026-08-14T12:00:00.000Z'
  },
  fetchImpl: async (_url, options) => {
    registrationBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
});
assert.equal(registered.ok, true);
assert.equal(registrationBody.cost_confirmed_zero, true);
assert.equal(registrationBody.external_network_used, false);
assert.equal(registrationBody.agent.mode, 'outbound-only');
assert.equal(registrationBody.hardware.resource_pressure.can_accept_local_jobs, true);
assert.equal(registrationBody.resource_pressure.free_memory_mb, 7000);
assert.equal(JSON.stringify(registrationBody).includes('prompt'), false);

const controller = new AbortController();
let online = null;
const fetchImpl = async () => new Response(JSON.stringify({}), { status: 404, headers: { 'content-type': 'application/json' } });
const resultPromise = runHost({
  config: {
    version: 'test', nodeId: stableNodeId(), siteUrl: 'https://matrix.invalid', adminToken: '', stateDir,
    heartbeatMs: 5, pollMs: 5, idlePollMs: 5, discoveryMs: 60000, benchmarkMs: 60000, benchmarkEnabled: false,
    minimumFreeMemoryMb: 4096, minimumFreeMemoryPercent: 25, benchmarkReserveMb: 1024, busyBackoffMs: 60000
  },
  fetchImpl,
  signal: controller.signal,
  pressureProbe: () => ({
    level: 'low', reasons: [], can_accept_local_jobs: true, can_run_benchmarks: true,
    external_compute_preferred: false, total_memory_mb: 16000, free_memory_mb: 8000,
    free_memory_percent: 50, assessed_at: '2026-08-14T12:00:00.000Z'
  }),
  onStatus: status => {
    if (status.state === 'online') {
      online = status;
      controller.abort();
    }
  }
});
const stopped = await resultPromise;
assert.equal(online.outbound_only, true);
assert.equal(online.zero_spend_lock, true);
assert.equal(online.mode, 'local-only-owner-token-required');
assert.equal(stopped.state, 'stopped');
const persisted = JSON.parse(await fs.readFile(path.join(stateDir, 'status.json'), 'utf8'));
assert.equal(persisted.state, 'stopped');

await fs.rm(stateDir, { recursive: true, force: true });
console.log('Persistent Matrix Host Node tests passed.');
