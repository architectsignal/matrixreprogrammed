const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'audit-site.js')], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 30 * 1024 * 1024
});
const stdout = result.stdout || '';
const stderr = result.stderr || '';
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
const issues = stderr.split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2));
const report = {
  ok: result.status === 0,
  generatedAt: new Date().toISOString(),
  exitCode: result.status,
  signal: result.signal || null,
  issueCount: issues.length,
  issues,
  outputTail: `${stdout}\n${stderr}`.trim().slice(-20000)
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'site-qa-report.json'), JSON.stringify(report, null, 2));
process.exit(result.status || 0);
