const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
fs.mkdirSync(downloads, { recursive: true });

const startedAt = new Date().toISOString();
const steps = [
  ['outcome-briefings', 'scripts/build-outcome-briefings.js'],
  ['daily-brain-brief', 'scripts/build-daily-brain-brief.js'],
  ['deploy-status', 'scripts/build-deploy-status.js'],
  ['generated-repair', 'scripts/repair-generated-site-artifacts.js'],
  ['search-repair', 'scripts/repair-search-system.js'],
  ['shared-assets', 'scripts/ensure-shared-assets.js'],
  ['worker-pages-origin', 'scripts/patch-worker-pages-origin.js'],
  ['cloudflare-output', 'scripts/build-cloudflare-output.js'],
  ['site-brain-health', 'scripts/site-brain-health.js'],
  ['shared-assets-final', 'scripts/ensure-shared-assets.js']
];

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function run(label, script) {
  const full = path.join(root, script);
  if (!fs.existsSync(full)) {
    return { label, script, status: 'missing-script', exitCode: 0, soft: true };
  }
  const result = spawnSync(process.execPath, [full], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  return {
    label,
    script,
    status: result.status === 0 ? 'ok' : 'failed',
    exitCode: result.status,
    stdout: String(result.stdout || '').slice(-3000),
    stderr: String(result.stderr || '').slice(-3000),
    soft: result.status !== 0
  };
}

const results = steps.map(([label, script]) => run(label, script));

const criticalFiles = [
  'index.html',
  'search.html',
  'search.js',
  'search-index.json',
  'deploy-status.json',
  'deploy-health.json',
  'downloads/deploy-status.json',
  'downloads/deploy-health.json',
  '_site/index.html',
  '_site/search.html',
  '_site/search',
  '_site/search.js',
  '_site/search-index.json'
];
const missingCritical = criticalFiles.filter(file => !exists(file));
const failedSteps = results.filter(step => step.status === 'failed');
const ok = missingCritical.length === 0;

const report = {
  ok,
  startedAt,
  finishedAt: new Date().toISOString(),
  purpose: 'Daily Sitewide Refresh safe builder. Runs shared intelligence/site-brain generators and blocks only when critical deploy/search outputs are missing.',
  failedSteps,
  missingCritical,
  results
};

fs.writeFileSync(path.join(downloads, 'daily-sitewide-build-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(downloads, 'daily-sitewide-build-report.md'), [
  '# Daily Sitewide Build Report',
  '',
  `Started: ${startedAt}`,
  `Finished: ${report.finishedAt}`,
  `Result: ${ok ? 'PASS' : 'FAIL'}`,
  '',
  '## Missing Critical Files',
  missingCritical.length ? missingCritical.map(file => `- ${file}`).join('\n') : '- None',
  '',
  '## Failed Generator Steps',
  failedSteps.length ? failedSteps.map(step => `- ${step.label}: ${step.exitCode}`).join('\n') : '- None',
  '',
  '## All Steps',
  results.map(step => `- ${step.label}: ${step.status}`).join('\n')
].join('\n'));

if (!ok) {
  console.error('DAILY SITEWIDE BUILD FAILED');
  console.error(`Missing critical files: ${missingCritical.join(', ') || 'none'}`);
  console.error(`Failed soft steps: ${failedSteps.map(s => s.label).join(', ') || 'none'}`);
  process.exit(1);
}

console.log('DAILY SITEWIDE BUILD PASSED');
if (failedSteps.length) console.log(`Soft generator failures recorded: ${failedSteps.map(s => s.label).join(', ')}`);
console.log('Report: downloads/daily-sitewide-build-report.json');
