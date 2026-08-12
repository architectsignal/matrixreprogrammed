import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-local-cli-'));
process.env.MATRIX_LOCAL_STATE_DIR = stateDir;
process.env.MATRIX_LOCAL_BENCHMARK_ENABLED = 'false';
process.env.MATRIX_LOCAL_DISCOVERY_SECONDS = '30';
const {
  configureWindowsAutostart,
  processAlive,
  statusSnapshot,
  windowsAutostartArguments,
  windowsRegistryAutostartArguments
} = await import('./matrix-local.mjs');
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

  const registryAutostart = windowsRegistryAutostartArguments('enable');
  assert.equal(registryAutostart.includes('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'), true);
  assert.equal(registryAutostart.includes('REG_SZ'), true);
  assert.equal(registryAutostart.some(value => /matrix-local\.mjs/.test(value)), true);

  const calls = [];
  const fallback = await configureWindowsAutostart('enable', async (command, args) => {
    calls.push({ command, args });
    if (command === 'schtasks.exe') throw Object.assign(new Error('Access is denied.'), { stderr: 'ERROR: Access is denied.' });
    return { stdout: 'The operation completed successfully.' };
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.configured, true);
  assert.equal(fallback.provider, 'current-user-run');
  assert.match(fallback.fallback_reason, /Access is denied/i);
  assert.deepEqual(calls.map(call => call.command), ['schtasks.exe', 'reg.exe']);
} finally {
  await fs.rm(stateDir, { recursive: true, force: true });
}

console.log('Matrix Host status, benchmark and explicit auto-start CLI contract test passed.');
