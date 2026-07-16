#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = relative => path.join(root, relative);
const read = relative => fs.readFileSync(at(relative), 'utf8');
const exists = relative => fs.existsSync(at(relative));
const checks = [];
const failures = [];

function need(name, condition, details = {}) {
  const ok = Boolean(condition);
  checks.push({ name, ok, ...details });
  if (!ok) failures.push(name);
}

const daily = read('.github/workflows/daily-investigation-machine.yml');
const weekly = read('.github/workflows/weekly-investigation-machine.yml');
const handoff = read('.github/workflows/investigation-deploy-handoff.yml');
const packageJson = JSON.parse(read('package.json'));

need('Daily investigation has manual and daily schedule triggers',
  /workflow_dispatch:/.test(daily) && /cron:\s*['"]20 5 \* \* \*['"]/.test(daily));
need('Weekly investigation has manual and Sunday schedule triggers',
  /workflow_dispatch:/.test(weekly) && /cron:\s*['"]40 6 \* \* 0['"]/.test(weekly));
need('Daily concurrency cancels obsolete overlapping runs',
  /group:\s*daily-investigation-machine/.test(daily) && /cancel-in-progress:\s*true/.test(daily));
need('Weekly concurrency does not cancel an active deep sweep',
  /group:\s*weekly-investigation-machine/.test(weekly) && /cancel-in-progress:\s*false/.test(weekly));
need('Daily chain performs collection, change monitoring and preservation',
  ['run-investigation-machine.js daily', 'monitor-source-changes.js daily', 'harden-source-change-preservation.js daily']
    .every(marker => daily.includes(marker)));
need('Weekly chain performs collection, change monitoring and preservation',
  ['run-investigation-machine.js weekly', 'monitor-source-changes.js weekly', 'harden-source-change-preservation.js weekly']
    .every(marker => weekly.includes(marker)));
need('Both chains rebuild Live Intel, seven-day intelligence and search',
  [daily, weekly].every(text => text.includes('update-live-intel.js')
    && text.includes('update-seven-day-intel.js')
    && text.includes('repair-search-system.js')
    && text.includes('extend-search-with-investigations.js')));
need('Daily chain applies production freshness policy before commit',
  daily.includes('production-freshness-guard.js'));
need('Both chains preserve proof artifacts on success or failure',
  daily.includes('if: always()') && weekly.includes('if: always()'));
need('Investigation completion handoff listens to daily and weekly workflows',
  /workflow_run:/.test(handoff)
    && /Daily Investigation Machine/.test(handoff)
    && /Weekly Investigation Machine/.test(handoff)
    && /types:\s*\[\s*completed\s*\]/.test(handoff));
need('Investigation completion handoff dispatches only successful runs',
  /github\.event\.workflow_run\.conclusion\s*==\s*['"]success['"]/.test(handoff));
need('Handoff has Actions write permission and no repository write permission',
  /actions:\s*write/.test(handoff) && /contents:\s*read/.test(handoff) && !/contents:\s*write/.test(handoff));
need('Handoff dispatches the existing guarded production workflow on latest main',
  /gh workflow run ["']Matrix Reprogrammed Production Deploy["']/.test(handoff)
    && /--ref main/.test(handoff));
need('Handoff preserves a machine-readable proof artifact',
  handoff.includes('investigation-deploy-handoff.json') && handoff.includes('upload-artifact@v4'));
need('Production fail-closed guard scripts exist',
  exists('scripts/production-freshness-guard.js')
    && exists('scripts/production-sync-test.js')
    && exists('scripts/production-deploy-guard.js')
    && exists('scripts/verify-live-production.js'));
need('Normal build begins with the canonical clock updater',
  String(packageJson.scripts?.build || '').startsWith('node scripts/build-public-usefulness-clock-system.js'));
need('Final mission reconciliation rebuilds the canonical clocks',
  String(packageJson.scripts?.['finalize-mission-surfaces'] || '').includes('build-public-usefulness-clock-system.js'));
need('Clock-specific pressure test runs source, wall and classified speculation tests',
  String(packageJson.scripts?.['pressure-test:global-risk-clocks'] || '').includes('global-risk-clocks-test.js')
    && String(packageJson.scripts?.['pressure-test:global-risk-clocks'] || '').includes('public-usefulness-clocks-test.js'));

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  schedules: {
    daily: '05:20 UTC every day',
    weekly: '06:40 UTC every Sunday',
    deployment: 'immediately dispatched after a successful investigation; existing production schedule remains as fallback'
  }
};

fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/auto-update-contract-test.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(at('downloads/auto-update-contract-test.md'), [
  '# Automatic Update Contract Test',
  '',
  `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
  '',
  ...checks.map(item => `- ${item.ok ? 'PASS' : 'FAIL'} — ${item.name}`)
].join('\n'));

if (!report.ok) {
  console.error('AUTO UPDATE CONTRACT TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`AUTO UPDATE CONTRACT TEST PASSED: ${checks.length} scheduler, handoff, guard and build contracts verified.`);
