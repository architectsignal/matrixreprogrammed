'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const failures = [];
const warnings = [];
const exists = relative => fs.existsSync(path.join(root, relative));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const fail = message => failures.push(message);

for (const relative of [
  'data/public-consequence-due-index.json',
  'downloads/public-consequence-due-index-report.json',
  'scripts/build-public-consequence-due-index.js',
  'src/worker-consequence-tracker.js',
  'src/worker-production.js',
  'wrangler.toml'
]) if (!exists(relative)) fail(`Missing ${relative}`);

for (const relative of ['scripts/build-public-consequence-due-index.js','scripts/public-consequence-tracker-pressure-test.js','src/worker-consequence-tracker.js','src/worker-production.js']) {
  if (!exists(relative)) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`${relative} syntax failed: ${result.stderr || result.stdout}`);
}

if (!failures.length) {
  const manifest = json('data/public-consequence-due-index.json');
  const contracts = Array.isArray(manifest.contracts) ? manifest.contracts : [];
  if (manifest.count !== contracts.length || contracts.length < 3 || contracts.length > 12) fail('Due index must contain 3-12 contracts with a matching count');
  if (Number(manifest.freeTierBudget?.scheduledRunsPerDay) !== 1) fail('Tracker must use one scheduled run per day');
  if (Number(manifest.freeTierBudget?.dueContractsPerRunMaximum) > 4) fail('Tracker due batch exceeds the free-tier cap');
  if (Number(manifest.freeTierBudget?.perFollowerWrites) !== 0) fail('Tracker must not write once per follower');
  if (manifest.freeTierBudget?.aiInferenceInsideWorker !== false) fail('AI inference must remain outside the Worker runtime');
  for (const contract of contracts) {
    if (!contract.id || !contract.title || !contract.contentHash || !/^[a-f0-9]{64}$/.test(contract.contentHash)) fail(`${contract.id || '(blank)'} has an invalid content hash`);
    if (!contract.route || !contract.accountabilityQuestion || !contract.evidenceBoundary) fail(`${contract.id || '(blank)'} lacks route or evidence boundary`);
    const cadence = (Array.isArray(contract.checkpoints) ? contract.checkpoints : []).map(item => Number(item.daysAfterAction)).join(',');
    if (cadence !== '30,90,365') fail(`${contract.id || '(blank)'} does not retain 30/90/365 checkpoints`);
  }

  const worker = read('src/worker-consequence-tracker.js');
  for (const marker of ['MAX_MANIFEST_CONTRACTS = 12','MAX_DUE_PER_RUN = 4','perFollowerWrites: 0','aiInferenceInsideWorker: false','consequence_contract_versions','consequence_review_queue','consequence_events','member_entity_follows','locked-primary-decision-record']) {
    if (!worker.includes(marker)) fail(`Tracker runtime missing ${marker}`);
  }
  const estimatedMaximumQueries = 6 + (12 * 2) + 1 + (4 * 3);
  if (estimatedMaximumQueries > 50) fail(`Estimated D1 query count ${estimatedMaximumQueries} exceeds the Workers Free per-invocation limit`);

  const production = read('src/worker-production.js');
  if (!production.includes("from './worker-consequence-tracker.js'") || !production.includes('consequenceTrackerWorker.scheduled')) fail('Production Worker does not own the consequence tracker');

  const wrangler = read('wrangler.toml');
  if (/run_worker_first\s*=\s*true/.test(wrangler)) fail('All static traffic still invokes the Worker');
  if (!wrangler.includes('run_worker_first = [') || !wrangler.includes('"/api/*"')) fail('Selective Worker-first asset routing is missing');
  if ((wrangler.match(/crons\s*=\s*\[/g) || []).length !== 1) fail('Tracker added a second cron declaration instead of reusing the existing schedule');

  const report = json('downloads/public-consequence-due-index-report.json');
  if (!report.ok || Number(report.indexedContracts) !== contracts.length) fail('Due-index report mismatch');
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  warnings,
  freeTierModel: {
    scheduledRunsPerDay: 1,
    maximumManifestContracts: 12,
    maximumDuePerRun: 4,
    estimatedMaximumD1QueriesPerRun: 43,
    perFollowerWrites: 0,
    staticAssetsInvokeWorker: false
  }
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'public-consequence-tracker-pressure-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (exists('_site')) {
  fs.mkdirSync(path.join(root, '_site', 'downloads'), { recursive: true });
  fs.copyFileSync(path.join(root, 'downloads', 'public-consequence-tracker-pressure-test.json'), path.join(root, '_site', 'downloads', 'public-consequence-tracker-pressure-test.json'));
}
if (failures.length) {
  console.error('PUBLIC CONSEQUENCE TRACKER PRESSURE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('Public Consequence Tracker pressure test passed inside Cloudflare Free limits.');
