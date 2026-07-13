const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const startedAt = new Date().toISOString();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'build:legacy'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
  maxBuffer: 120 * 1024 * 1024,
  env: process.env
});
const stdout = String(result.stdout || '');
const stderr = String(result.stderr || '');
const report = {
  ok: result.status === 0,
  startedAt,
  finishedAt: new Date().toISOString(),
  status: result.status,
  signal: result.signal || null,
  command: 'npm run build:legacy',
  stdoutTail: stdout.slice(-24000),
  stderrTail: stderr.slice(-24000),
  boundary: 'This wrapper preserves the existing fail-fast build chain while retaining the exact final output in a workflow artifact.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'build-pipeline-report.json'), JSON.stringify(report, null, 2));
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
if (result.error) console.error(result.error.stack || result.error.message || result.error);
if (result.status !== 0) {
  console.error(`BUILD PIPELINE FAILED with status ${result.status}. See downloads/build-pipeline-report.json.`);
  process.exit(result.status || 1);
}
console.log('BUILD PIPELINE PASSED. Diagnostic report: downloads/build-pipeline-report.json');
