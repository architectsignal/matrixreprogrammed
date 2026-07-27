'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = [
  'scripts/auto-update-contract-test.js',
  'scripts/auto-update-system-deep-test.js',
  'scripts/run-investigation-machine.js',
  'scripts/monitor-source-changes.js',
  'scripts/harden-source-change-preservation.js',
  'scripts/repair-investigation-data-integrity.js',
  'scripts/enforce-mission-data-contracts.js',
  'scripts/build-daily-watch.js',
  'scripts/stabilize-daily-watch-and-build-dossiers.js',
  'scripts/build-daily-watch-history.js',
  'scripts/inject-daily-watch-surfaces.js',
  'scripts/daily-hit-list-stability-test.js',
  'scripts/mission-orchestration-audit.js',
  'scripts/runtime-performance-budget-test.js',
  'scripts/update-public-usefulness-clock-scores.js',
  'scripts/production-freshness-guard.js'
];

const checks = files.map(file => {
  const absolute = path.join(root, file);
  const result = spawnSync(process.execPath, ['--check', absolute], { cwd:root, encoding:'utf8' });
  const check = {
    file,
    ok: result.status === 0,
    exitCode: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${file}`);
  if (!check.ok) console.error(check.stderr || check.stdout || 'Unknown parser failure.');
  return check;
});

const failures = checks.filter(check => !check.ok);
const report = { ok:failures.length === 0,generatedAt:new Date().toISOString(),checks,failures };
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','mission-syntax-check.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(root,'downloads','mission-syntax-check.md'),['# Mission Syntax Check','',`Result: ${report.ok ? 'PASS' : 'FAIL'}`,'',...checks.map(check => `- **${check.ok ? 'PASS' : 'FAIL'}** ${check.file}${check.ok ? '' : `\n\n  \`\`\`\n${check.stderr || check.stdout}\n  \`\`\``}`)].join('\n'));
if (failures.length) process.exit(1);
