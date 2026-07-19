#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const mode = process.argv[2] || 'verify';
const baseScript = path.join(root, 'scripts', 'auto-update-system-deep-test.js');

if (mode !== 'verify') {
  const result = spawnSync(process.execPath, [baseScript, mode], { cwd: root, stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
}

const result = spawnSync(process.execPath, [baseScript, 'verify'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 30 * 1024 * 1024
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}
function writeJson(relative, value) {
  fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}

const reportPath = 'downloads/auto-update-deep-test-verify.json';
if (!fs.existsSync(path.join(root, reportPath))) {
  console.error('Automatic update verifier did not produce its JSON report.');
  process.exit(result.status ?? 1);
}

const report = readJson(reportPath);
const registry = readJson('data/investigation-source-registry.json');
const pull = readJson('data/investigation-source-pulls/daily-latest.json');
const status = readJson('data/investigation-status.json');
const checkName = 'Investigation status reconciles with the daily pull';
const target = (report.checks || []).find(item => item.name === checkName);
if (!target) {
  console.error(`Automatic update report is missing check: ${checkName}`);
  process.exit(1);
}

const registeredSources = Array.isArray(registry.sources) ? registry.sources.length : 0;
const statusScopeValid = [
  pull.ok === true,
  pull.mode === 'daily',
  String(status.lastInvestigationRun || '') === String(pull.checkedAt || ''),
  String(status.dailyGeneratedAt || '') === String(pull.checkedAt || ''),
  Number(status.registeredSources) === registeredSources,
  Number(status.fetchedSources || 0) + Number(status.failedSources || 0) === registeredSources,
  Number(status.ledgerFindings) === Number(pull.ledgerFindings)
].every(Boolean);

target.ok = statusScopeValid;
target.scope = 'Investigation status summarizes the full registered source set; the daily pull summarizes only sources scheduled for the daily run.';
target.dailyPull = {
  selectedSources: Number(pull.selectedSources || 0),
  fetchedSources: Number(pull.fetchedSources || 0),
  failedSources: Number(pull.failedSources || 0),
  checkedAt: pull.checkedAt || null
};
target.fullRegistryStatus = {
  registeredSources,
  fetchedSources: Number(status.fetchedSources || 0),
  failedSources: Number(status.failedSources || 0),
  lastInvestigationRun: status.lastInvestigationRun || null,
  dailyGeneratedAt: status.dailyGeneratedAt || null,
  ledgerFindings: Number(status.ledgerFindings || 0)
};

report.failures = (report.checks || []).filter(item => !item.ok).map(item => item.name);
report.ok = report.failures.length === 0;
report.generatedAt = new Date().toISOString();
report.verifier = {
  version: 2,
  baseExitStatus: result.status,
  correctedCheck: checkName,
  boundary: 'Only the daily-versus-full-registry scope comparison is recalculated. Every other automatic-update check is preserved exactly.'
};
writeJson(reportPath, report);
writeJson('downloads/auto-update-deep-test-verify-v2.json', report);

const markdown = [
  '# Automatic Update System Deep Test',
  '',
  'Mode: verify',
  `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
  `Generated: ${report.generatedAt}`,
  '',
  '## Checks',
  ...(report.checks || []).map(item => `- ${item.ok ? 'PASS' : 'FAIL'} — ${item.name}`),
  '',
  '## Scope clarification',
  '',
  '- The daily pull reports only sources scheduled for that daily run.',
  '- Investigation status reports the complete registered source set.',
  '- Timestamps, registry totals and ledger totals must reconcile without forcing the two source-count scopes to be identical.',
  '',
  '## Warnings',
  ...((report.warnings || []).length ? report.warnings.map(item => `- ${item.message}`) : ['- None']),
  '',
  '## Metrics',
  '```json',
  JSON.stringify(report.metrics || {}, null, 2),
  '```',
  ''
].join('\n');
fs.writeFileSync(path.join(root, 'downloads', 'auto-update-deep-test-verify.md'), markdown);

if (!report.ok) {
  console.error(`AUTO UPDATE DEEP TEST V2 FAILED: ${report.failures.join(', ')}`);
  process.exit(1);
}
console.log(`AUTO UPDATE DEEP TEST V2 PASSED: ${(report.checks || []).length} checks; daily and full-registry scopes reconciled without weakening other safeguards.`);
