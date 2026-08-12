import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-local-cli-'));
process.env.MATRIX_LOCAL_STATE_DIR = stateDir;
process.env.MATRIX_LOCAL_BENCHMARK_ENABLED = 'false';
process.env.MATRIX_LOCAL_DISCOVERY_SECONDS = '30';
const { processAlive, statusSnapshot, windowsAutostartArguments } = await import('./matrix-local.mjs');
const { benchmarkLocalRuntime } = await import('./local-benchmark.mjs');

try {
  const heartbeat = new Date().toISOString();
  await fs.writeFile(path.join(stateDir, 'supervisor.json'), JSON.stringify({ pid: process.pid, state: 'online' }));
  await fs.writeFile(path.join(stateDir, 'status.json'), JSON.stringify({ pid: process.pid, state: 'online', heartbeat_at: heartbeat, outbound_only: true, zero_spend_lock: true }));
  const status = await statusSnapshot(stateDir);
  assert.equal(status.ok, true);
  assert.equal(status.supervisor_online, true);
  assert.equal(status.host.state, 'online');
  assert.equal(status.host.outbound_only, true);
  assert.equal(status.host.zero_spend_lock, true);
  assert.equal(processAlive(process.pid), true);

  const benchmark = await benchmarkLocalRuntime({ resources: [] }, { stateDir });
  assert.equal(benchmark.zero_spend_confirmed, true);
  assert.equal(benchmark.external_network_used, false);
  assert.match(benchmark.deterministic_cpu.result_sha256, /^[a-f0-9]{64}$/);

  const autostart = windowsAutostartArguments('enable');
  assert.equal(autostart.includes('ONLOGON'), true);
  assert.equal(autostart.includes('LIMITED'), true);
  assert.equal(autostart.some(value => /matrix-local\.mjs/.test(value)), true);
} finally {
  await fs.rm(stateDir, { recursive: true, force: true });
}

console.log('Matrix Host status, benchmark and explicit auto-start CLI contract test passed.');
