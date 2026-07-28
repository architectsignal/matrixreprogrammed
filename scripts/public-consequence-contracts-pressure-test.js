'use strict';

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
  'data/public-consequence-contracts.json',
  'downloads/public-consequence-contracts.csv',
  'downloads/public-consequence-contracts-report.json',
  'public-consequence-contracts.html',
  'public-consequence-contracts.css',
  'scripts/build-public-consequence-contracts.js'
];
for (const relative of required) if (!exists(relative)) fail(`Missing ${relative}`);

function syntax(relative) {
  if (!exists(relative)) return;
  const result = spawnSync(process.execPath, ['--check', file(relative)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`${relative} syntax failed: ${result.stderr || result.stdout}`);
}
for (const relative of ['scripts/build-public-consequence-contracts.js','scripts/public-consequence-contracts-pressure-test.js']) syntax(relative);

if (!failures.length) {
  const ledger = json('data/public-consequence-contracts.json');
  const contracts = array(ledger.contracts);
  if (ledger.count !== contracts.length) fail('Consequence Contract count mismatch');
  if (contracts.length < 3) fail('At least three Public Consequence Contracts are required');
  if (!clean(ledger.proposition).includes('dated outcome checks')) fail('Ledger proposition lacks dated outcome checks');
  if (!clean(ledger.boundary).includes('not a legal contract')) fail('Ledger boundary must state that this is not a legal contract');
  const ids = new Set();
  for (const contract of contracts) {
    if (!clean(contract.id)) fail('Contract missing id');
    if (ids.has(contract.id)) fail(`Duplicate contract id ${contract.id}`);
    ids.add(contract.id);
    for (const field of ['title','lane','actionDate','status','termsLock','outcomeVerdict','outcomeScoreRule','accountabilityQuestion','responseStatus','evidenceBoundary']) if (!clean(contract[field])) fail(`${contract.id || 'contract'} missing ${field}`);
    if (contract.status !== 'lead-stage-contract') fail(`${contract.id} is not lead-stage`);
    if (contract.termsLock !== 'unlocked-pending-primary-decision-record') fail(`${contract.id} terms were prematurely locked`);
    if (contract.outcomeVerdict !== 'not-scored') fail(`${contract.id} received a premature outcome verdict`);
    if (!clean(contract.outcomeScoreRule).includes('No success, failure or beneficiary finding')) fail(`${contract.id} lacks fail-closed outcome rule`);
    if (!/^https?:\/\//i.test(clean(contract.source?.url))) fail(`${contract.id} lacks an external source URL`);
    if (!clean(contract.source?.evidenceRoute)) fail(`${contract.id} lacks evidence route`);
    if (!clean(contract.actionRecord?.responsibleActor).includes('Not yet resolved')) fail(`${contract.id} invents a responsible actor`);
    if (!clean(contract.actionRecord?.authorityBasis).includes('Not yet')) fail(`${contract.id} invents an authority basis`);
    if (!clean(contract.actionRecord?.claimedPublicBenefit).includes('Not yet')) fail(`${contract.id} invents a public benefit claim`);
    if (array(contract.consequenceMap?.knownBeneficiaries).length) fail(`${contract.id} invents known beneficiaries at lead stage`);
    if (!array(contract.consequenceMap?.moneyQuestions).length) fail(`${contract.id} lacks money questions`);
    if (!clean(contract.consequenceMap?.beneficiaryQuestion)) fail(`${contract.id} lacks beneficiary question`);
    if (!clean(contract.consequenceMap?.affectedGroupQuestion)) fail(`${contract.id} lacks affected-group question`);
    if (!clean(contract.consequenceMap?.authorityQuestion)) fail(`${contract.id} lacks authority question`);
    if (array(contract.checkpoints).length !== 3) fail(`${contract.id} must have exactly three checkpoints`);
    const days = array(contract.checkpoints).map(item => Number(item.daysAfterAction));
    if (days.join(',') !== '30,90,365') fail(`${contract.id} checkpoints must be 30, 90 and 365 days`);
    for (const checkpoint of array(contract.checkpoints)) {
      if (!clean(checkpoint.dueAt) || !Number.isFinite(Date.parse(checkpoint.dueAt))) fail(`${contract.id}/${checkpoint.id || 'checkpoint'} has invalid date`);
      if (!['scheduled','due-now','overdue-for-review'].includes(checkpoint.status)) fail(`${contract.id}/${checkpoint.id || 'checkpoint'} has invalid status`);
      if (!clean(checkpoint.reviewQuestion)) fail(`${contract.id}/${checkpoint.id || 'checkpoint'} lacks review question`);
    }
    if (array(contract.outcomeMetrics).length < 4) fail(`${contract.id} lacks outcome metrics`);
    if (array(contract.falsifiers).length < 4) fail(`${contract.id} lacks falsifiers`);
    if (!clean(contract.followTarget?.route).includes(`#${contract.id}`)) fail(`${contract.id} follow target does not return to the contract`);
    if (contract.versionHistoryStatus !== 'current-snapshot-only') fail(`${contract.id} overclaims persistent version history`);
  }

  const page = read('public-consequence-contracts.html');
  for (const marker of ['THE ACCOUNTABILITY TWIN','Public Consequence Contract','Lock the original terms','Map who gains and who pays','Check the real outcome','30, 90 and 365 days','not a legal contract']) if (!page.includes(marker)) fail(`Consequence page missing marker: ${marker}`);
  if ((page.match(/class="consequence-contract-card/g) || []).length !== contracts.length) fail('Consequence page card count does not match ledger');
  if (!page.includes('data-follow-id=')) fail('Consequence page lacks working follow controls');

  const home = read('index.html');
  for (const marker of ['<!-- accountability-twin:start -->','THE ACCOUNTABILITY TWIN','public-consequence-contracts.html','public-consequence-contracts.css']) if (!home.includes(marker)) fail(`Homepage missing consequence marker: ${marker}`);
  if ((home.match(/class="consequence-contract-card compact"/g) || []).length !== 3) fail('Homepage must feature exactly three compact consequence contracts');

  const index = json('search-index.json');
  if (!array(index).some(item => item.url === 'public-consequence-contracts.html')) fail('Search index lacks Accountability Twin landing page');
  if (array(index).filter(item => String(item.url || '').startsWith('public-consequence-contracts.html#')).length !== contracts.length) fail('Search index contract count mismatch');

  const report = json('downloads/public-consequence-contracts-report.json');
  if (!report.ok) fail('Consequence Contract build report is not OK');
  if (Number(report.contracts || 0) !== contracts.length) fail('Consequence Contract report count mismatch');
  if (Number(report.scheduledCheckpoints || 0) !== contracts.length * 3) fail('Consequence Contract checkpoint count mismatch');
  if (Number(report.outcomeVerdictsIssued || 0) !== 0) fail('Consequence Contract report shows premature verdicts');
}

if (exists('_site')) {
  for (const relative of ['data/public-consequence-contracts.json','downloads/public-consequence-contracts.csv','public-consequence-contracts.html','public-consequence-contracts.css','index.html','search-index.json']) if (!exists(relative, outputRoot)) fail(`Cloudflare output missing ${relative}`);
  if (exists('index.html', outputRoot) && !read('index.html', outputRoot).includes('THE ACCOUNTABILITY TWIN')) fail('Cloudflare homepage lacks Accountability Twin');
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
