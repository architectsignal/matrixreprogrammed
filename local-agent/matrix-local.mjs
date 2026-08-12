#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { detectLocalRuntime } from '../ai-management/local-runtime/hardware-detector.mjs';
import { benchmarkLocalRuntime } from './local-benchmark.mjs';
import { defaultStateDir, hostConfig, readJson, runHost, writeJson } from './matrix-local-host.mjs';

const execFileAsync = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const cliFile = path.join(directory, 'matrix-local.mjs');
const hostFile = path.join(directory, 'matrix-local-host.mjs');
const taskName = 'Matrix Reprogrammed Host';

function processAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

async function supervisorRecord(stateDir = defaultStateDir()) {
  return readJson(path.join(stateDir, 'supervisor.json'));
}

export function restartDelay(attempt) {
  return Math.min(60000, 1000 * (2 ** Math.min(6, Math.max(0, attempt - 1))));
}

export async function statusSnapshot(stateDir = defaultStateDir(), now = Date.now()) {
  const [supervisor, host] = await Promise.all([
    supervisorRecord(stateDir),
    readJson(path.join(stateDir, 'status.json'))
  ]);
  const supervisorOnline = processAlive(supervisor?.pid);
  const heartbeatAgeMs = host?.heartbeat_at ? now - Date.parse(host.heartbeat_at) : null;
  const heartbeatFresh = Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs >= 0 && heartbeatAgeMs <= 60000;
  return {
    ok: supervisorOnline && heartbeatFresh && host?.state === 'online',
    supervisor_online: supervisorOnline,
    heartbeat_fresh: heartbeatFresh,
    heartbeat_age_ms: heartbeatAgeMs,
    supervisor,
    host
  };
}

function wait(ms, signal) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export async function supervise({ stateDir = defaultStateDir(), spawnImpl = spawn, signal = null, hostScript = hostFile, onEvent = null } = {}) {
  await fsp.mkdir(stateDir, { recursive: true });
  const controller = new AbortController();
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  let restartCount = 0;
  let child = null;

  await writeJson(path.join(stateDir, 'supervisor.json'), {
    schema_version: 1, pid: process.pid, started_at: new Date().toISOString(), restart_count: restartCount, state: 'online'
  });

  while (!controller.signal.aborted) {
    child = spawnImpl(process.execPath, [hostScript], {
      env: { ...process.env, MATRIX_LOCAL_STATE_DIR: stateDir },
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true
    });
    onEvent?.({ type: 'spawn', pid: child.pid, restart_count: restartCount });
    const exit = await new Promise(resolve => {
      child.once('exit', (code, childSignal) => resolve({ code, signal: childSignal }));
      child.once('error', error => resolve({ code: 1, signal: null, error: error.message }));
      controller.signal.addEventListener('abort', () => {
        if (child && !child.killed) child.kill('SIGTERM');
      }, { once: true });
    });
    if (controller.signal.aborted) break;
    restartCount += 1;
    const delayMs = restartDelay(restartCount);
    await writeJson(path.join(stateDir, 'supervisor.json'), {
      schema_version: 1, pid: process.pid, started_at: new Date().toISOString(), restart_count: restartCount,
      state: 'recovering', last_child_exit: { ...exit, at: new Date().toISOString() }, next_restart_delay_ms: delayMs
    });
    onEvent?.({ type: 'restart', ...exit, restart_count: restartCount, delay_ms: delayMs });
    await wait(delayMs, controller.signal);
  }
  if (child && !child.killed) child.kill('SIGTERM');
  await writeJson(path.join(stateDir, 'supervisor.json'), {
    schema_version: 1, pid: process.pid, restart_count: restartCount, state: 'stopped', stopped_at: new Date().toISOString()
  });
}

async function start() {
  const stateDir = defaultStateDir();
  const existing = await statusSnapshot(stateDir);
  if (existing.supervisor_online) return { ok: true, already_running: true, ...existing };
  await fsp.mkdir(stateDir, { recursive: true });
  const logFile = path.join(stateDir, 'matrix-local.log');
  const output = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [cliFile, 'supervise'], {
    detached: true,
    env: { ...process.env, MATRIX_LOCAL_STATE_DIR: stateDir },
    stdio: ['ignore', output, output],
    windowsHide: true
  });
  child.unref();
  fs.closeSync(output);
  await writeJson(path.join(stateDir, 'supervisor.json'), {
    schema_version: 1, pid: child.pid, started_at: new Date().toISOString(), restart_count: 0, state: 'launching'
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(250);
    const current = await statusSnapshot(stateDir);
    if (current.ok) return { ok: true, started: true, state_dir: stateDir, pid: child.pid, host: current.host };
    if (!processAlive(child.pid)) break;
  }
  return { ok: false, started: false, state_dir: stateDir, pid: child.pid, error: 'Host did not publish a healthy heartbeat within 10 seconds', log_file: logFile };
}

async function stop() {
  const stateDir = defaultStateDir();
  const [supervisor, host] = await Promise.all([
    supervisorRecord(stateDir),
    readJson(path.join(stateDir, 'status.json'))
  ]);
  const pid = Number(supervisor?.pid || 0);
  const hostPid = Number(host?.pid || 0);
  if (!processAlive(pid) && !processAlive(hostPid)) return { ok: true, already_stopped: true, pid: pid || null, host_pid: hostPid || null };
  if (process.platform === 'win32') {
    for (const target of [...new Set([pid, hostPid].filter(value => value > 0))]) {
      await execFileAsync('taskkill.exe', ['/PID', String(target), '/T', '/F'], { windowsHide: true }).catch(error => {
        if (processAlive(target)) throw error;
      });
    }
  } else {
    if (processAlive(pid)) process.kill(pid, 'SIGTERM');
    if (hostPid !== pid && processAlive(hostPid)) process.kill(hostPid, 'SIGTERM');
  }
  for (let attempt = 0; attempt < 40 && (processAlive(pid) || processAlive(hostPid)); attempt += 1) await wait(250);
  const stopped = !processAlive(pid) && !processAlive(hostPid);
  return { ok: stopped, stopped, pid: pid || null, host_pid: hostPid || null };
}

async function doctor() {
  const config = hostConfig();
  const runtime = await detectLocalRuntime();
  const state = await statusSnapshot(config.stateDir);
  let publicSite = { ok: false };
  try {
    const response = await fetch(`${config.siteUrl}/answer-engine`, { signal: AbortSignal.timeout(10000) });
    publicSite = { ok: response.ok, status: response.status };
  } catch (error) {
    publicSite = { ok: false, error: String(error?.message || error) };
  }
  return {
    ok: runtime.cost_confirmed_zero === true && runtime.external_network_used === false,
    node_id: config.nodeId,
    zero_spend_lock: true,
    outbound_only: true,
    owner_token_configured: Boolean(config.adminToken),
    public_site: publicSite,
    service: state,
    hardware: runtime.hardware,
    model_servers: runtime.servers.map(server => ({ protocol: server.protocol, endpoint: server.endpoint, healthy: server.healthy, models: server.models.length })),
    discovered_models: runtime.resources.length,
    actions_required: [
      ...(!config.adminToken ? ['Set MATRIX_AI_MANAGEMENT_ADMIN_TOKEN to connect this node to the owner control plane.'] : []),
      ...(runtime.resources.length === 0 ? ['Install or start an owner-controlled loopback model runtime such as Ollama or LM Studio to enable local inference.'] : [])
    ]
  };
}

async function benchmark() {
  const config = hostConfig();
  const runtime = await detectLocalRuntime();
  return benchmarkLocalRuntime(runtime, { stateDir: config.stateDir });
}

function taskRunCommand() {
  return `"${process.execPath}" "${cliFile}" supervise`;
}

export function windowsAutostartArguments(action) {
  if (action === 'enable') return ['/Create', '/TN', taskName, '/SC', 'ONLOGON', '/TR', taskRunCommand(), '/RL', 'LIMITED', '/F'];
  if (action === 'disable') return ['/Delete', '/TN', taskName, '/F'];
  return ['/Query', '/TN', taskName, '/FO', 'LIST', '/V'];
}

async function autostart(action) {
  if (process.platform !== 'win32') return { ok: false, error: 'Automatic login start is currently implemented for Windows; use the foreground run command with your service manager.' };
  if (!['enable', 'disable', 'status'].includes(action)) throw new Error('Use: matrix-local autostart enable|disable|status');
  try {
    const result = await execFileAsync('schtasks.exe', windowsAutostartArguments(action), { windowsHide: true });
    return { ok: true, action, task_name: taskName, output: String(result.stdout || '').trim() };
  } catch (error) {
    if (action === 'status' || action === 'disable') return { ok: action === 'disable', action, configured: false, task_name: taskName };
    throw error;
  }
}

async function logs(lines = 80) {
  const file = path.join(defaultStateDir(), 'matrix-local.log');
  try {
    const content = await fsp.readFile(file, 'utf8');
    return { ok: true, log_file: file, lines: content.split(/\r?\n/).slice(-Math.max(1, Math.min(1000, Number(lines) || 80))).join('\n') };
  } catch {
    return { ok: false, log_file: file, error: 'No Host Node log exists yet.' };
  }
}

async function main(argv = process.argv.slice(2)) {
  const [command = 'status', argument] = argv;
  let result;
  if (command === 'start') result = await start();
  else if (command === 'stop') result = await stop();
  else if (command === 'status') result = await statusSnapshot();
  else if (command === 'doctor') result = await doctor();
  else if (command === 'benchmark') result = await benchmark();
  else if (command === 'logs') result = await logs(argument);
  else if (command === 'run') result = await runHost();
  else if (command === 'supervise') result = await supervise();
  else if (command === 'autostart') result = await autostart(argument || 'status');
  else throw new Error('Use: matrix-local start|stop|status|doctor|benchmark|logs|run|autostart');
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
  if (result?.ok === false && !['status', 'logs'].includes(command)) process.exitCode = 1;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
    process.exit(1);
  });
}

export { doctor, main, processAlive, start, stop };
