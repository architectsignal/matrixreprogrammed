import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { restartDelay, supervise, windowsAutostartArguments } from './matrix-local.mjs';

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-local-supervisor-'));
const counterFile = path.join(stateDir, 'counter.txt');
const fixture = path.join(stateDir, 'fixture.mjs');
await fs.writeFile(fixture, `
  import fs from 'node:fs';
  const file = process.env.MATRIX_LOCAL_STATE_DIR + '/counter.txt';
  const count = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
  fs.writeFileSync(file, String(count + 1));
  if (count === 0) process.exit(7);
  setInterval(() => {}, 1000);
  process.on('SIGTERM', () => process.exit(0));
`);
const controller = new AbortController();
const events = [];
await supervise({
  stateDir,
  hostScript: fixture,
  signal: controller.signal,
  onEvent: event => {
    events.push(event);
    if (event.type === 'spawn' && events.filter(item => item.type === 'spawn').length === 2) {
      // A spawn event precedes execution of the child fixture. Leave enough time for
      // a loaded Windows/Node runner to enter the process and persist its receipt.
      setTimeout(() => controller.abort(), 1000);
    }
  }
});
assert.equal(Number(await fs.readFile(counterFile, 'utf8')), 2, 'watchdog must restart a failed Host process');
assert.equal(events.some(event => event.type === 'restart' && event.code === 7), true);
assert.equal(restartDelay(1), 1000);
assert.equal(restartDelay(20), 60000);
const task = windowsAutostartArguments('enable');
assert.equal(task.includes('ONLOGON'), true);
assert.equal(task.includes('LIMITED'), true);
assert.equal(task.some(value => /matrix-local\.mjs/.test(value)), true);

await fs.rm(stateDir, { recursive: true, force: true });
console.log('Matrix Host watchdog, restart recovery and explicit auto-start contract tests passed.');
