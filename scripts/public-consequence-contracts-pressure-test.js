'use strict';

require('./finalize-public-consequence-runtime.js');

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = process.cwd();
const outputRoot = path.join(root, '_site');
const failures = [];
const warnings = [];
const file = (relative, base = root) => path.join(base, relative);
const exists = (relative, base = root) => fs.existsSync(file(relative, base));
const read = (relative, base = root) => {
  if (!exists(relative, base)) throw new Error(`Missing ${path.relative(root, file(relative, base))}`);
  return fs.readFileSync(file(relative, base), 'utf8');
};
const json = (relative, base = root) => JSON.parse(read(relative, base));
const array = value => Array.isArray(value) ? value : [];
const clean = value => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const fail = message => failures.push(message);
const warn = message => warnings.push(message);

const required = [
  'data/public-consequence-contracts.json','downloads/public-consequence-contracts.csv','downloads/public-consequence-contracts-report.json',
  'public-consequence-contracts.html','public-consequence-contracts.css','public-consequence-contracts.js',
  'scripts/build-public-consequence-contracts.js','scripts/finalize-public-consequence-runtime.js'
];
for (const relative of required) if (!exists(relative)) fail(`Missing ${relative}`);
for (const relative of ['scripts/build-public-consequence-contracts.js','scripts/finalize-public-consequence-runtime.js','public-consequence-contracts.js']) {
  if (!exists(relative)) continue;
  const result = spawnSync(process.execPath, ['--check', file(relative)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`${relative} syntax failed: ${result.stderr || result.stdout}`);
}

if (!failures.length) {
  const ledger = json('data/public-consequence-contracts.json');
  const contracts = array(ledger.contracts);
  if (ledger.count !== contracts.length || contracts.length < 3) fail('Consequence Contract ledger is empty or count-mismatched');
  if (!clean(ledger.boundary).includes('not a legal contract')) fail('Ledger lacks legal-contract boundary');
  const ids = new Set();
  for (const contract of contracts) {
    if (!clean(contract.id) || ids.has(contract.id)) fail(`Missing or duplicate contract id ${contract.id || '(blank)'}`);
    ids.add(contract.id);
    for (const field of ['title','lane','actionDate','status','termsLock','outcomeVerdict','outcomeScoreRule','accountabilityQuestion','evidenceBoundary']) if (!clean(contract[field])) fail(`${contract.id} missing ${field}`);
    if (contract.status !== 'lead-stage-contract' || contract.termsLock !== 'unlocked-pending-primary-decision-record' || contract.outcomeVerdict !== 'not-scored') fail(`${contract.id} contains a premature locked term or verdict`);
    if (!/^https?:\/\//i.test(clean(contract.source?.url))) fail(`${contract.id} lacks external source URL`);
    if (!clean(contract.source?.evidenceRoute)) fail(`${contract.id} lacks evidence route`);
    if (!clean(contract.actionRecord?.responsibleActor).includes('Not yet resolved')) fail(`${contract.id} invents a responsible actor`);
    if (!clean(contract.actionRecord?.authorityBasis).includes('Not yet') || !clean(contract.actionRecord?.claimedPublicBenefit).includes('Not yet')) fail(`${contract.id} invents authority or benefit terms`);
    if (array(contract.consequenceMap?.knownBeneficiaries).length) fail(`${contract.id} invents known beneficiaries`);
    if (array(contract.consequenceMap?.moneyQuestions).length < 3 || !clean(contract.consequenceMap?.beneficiaryQuestion) || !clean(contract.consequenceMap?.affectedGroupQuestion) || !clean(contract.consequenceMap?.authorityQuestion)) fail(`${contract.id} lacks consequence questions`);
    const checkpoints = array(contract.checkpoints);
    if (checkpoints.map(item => Number(item.daysAfterAction)).join(',') !== '30,90,365') fail(`${contract.id} checkpoint cadence is not 30/90/365`);
    for (const checkpoint of checkpoints) if (!Number.isFinite(Date.parse(checkpoint.dueAt)) || !clean(checkpoint.reviewQuestion)) fail(`${contract.id} has invalid checkpoint`);
    if (array(contract.outcomeMetrics).length < 4 || array(contract.falsifiers).length < 4) fail(`${contract.id} lacks metrics or falsifiers`);
    if (!clean(contract.followTarget?.route).includes(`#${contract.id}`)) fail(`${contract.id} follow target is invalid`);
    if (contract.versionHistoryStatus !== 'current-snapshot-only') fail(`${contract.id} overclaims persistent version history`);
  }

  const page = read('public-consequence-contracts.html');
  for (const marker of ['THE ACCOUNTABILITY TWIN','Public Consequence Contract','Lock the original terms','Map who gains and who pays','Check the real outcome','30, 90 and 365 days','not a legal contract','public-consequence-contracts.js']) if (!page.includes(marker)) fail(`Consequence page missing ${marker}`);
  if (page.includes('accountability-home.js')) fail('Consequence page still loads the homepage-only follow runtime');
  if ((page.match(/class="consequence-contract-card/g) || []).length !== contracts.length) fail('Consequence page card count mismatch');
  const runtime = read('public-consequence-contracts.js');
  if (!runtime.includes('/api/member/follows') || !runtime.includes('matrixPendingConsequenceFollow') || !runtime.includes('consequence_contract_follow')) fail('Consequence follow runtime is incomplete');

  const home = read('index.html');
  for (const marker of ['<!-- accountability-twin:start -->','THE ACCOUNTABILITY TWIN','public-consequence-contracts.html','public-consequence-contracts.css']) if (!home.includes(marker)) fail(`Homepage missing ${marker}`);
  if ((home.match(/class="consequence-contract-card compact"/g) || []).length !== 3) fail('Homepage must feature exactly three contracts');

  const index = json('search-index.json');
  if (!array(index).some(item => item.url === 'public-consequence-contracts.html')) fail('Search index lacks Accountability Twin page');
  if (array(index).filter(item => String(item.url || '').startsWith('public-consequence-contracts.html#')).length !== contracts.length) fail('Search index contract count mismatch');

  const report = json('downloads/public-consequence-contracts-report.json');
  if (!report.ok || Number(report.contracts || 0) !== contracts.length || Number(report.scheduledCheckpoints || 0) !== contracts.length * 3 || Number(report.outcomeVerdictsIssued || 0) !== 0) fail('Consequence Contract report mismatch');
}

if (exists('_site')) {
  for (const relative of ['data/public-consequence-contracts.json','downloads/public-consequence-contracts.csv','public-consequence-contracts.html','public-consequence-contracts.css','public-consequence-contracts.js','index.html','search-index.json']) if (!exists(relative, outputRoot)) fail(`Cloudflare output missing ${relative}`);
  if (exists('public-consequence-contracts.html', outputRoot) && !read('public-consequence-contracts.html', outputRoot).includes('public-consequence-contracts.js')) fail('Cloudflare consequence page lacks follow runtime');
}

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), failures, warnings };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'public-consequence-contracts-pressure-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (exists('_site')) {
  fs.mkdirSync(path.join(outputRoot, 'downloads'), { recursive: true });
  fs.copyFileSync(path.join(root, 'downloads', 'public-consequence-contracts-pressure-test.json'), path.join(outputRoot, 'downloads', 'public-consequence-contracts-pressure-test.json'));
}
if (failures.length) {
  console.error('PUBLIC CONSEQUENCE CONTRACTS PRESSURE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Public Consequence Contracts pressure test passed with ${warnings.length} warning(s).`);
