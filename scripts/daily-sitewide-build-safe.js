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

function full(file) {
  return path.join(root, file);
}
function exists(file) {
  return fs.existsSync(full(file));
}
function read(file, fallback = '') {
  return exists(file) ? fs.readFileSync(full(file), 'utf8') : fallback;
}
function write(file, value) {
  fs.mkdirSync(path.dirname(full(file)), { recursive: true });
  fs.writeFileSync(full(file), value);
}
function copyIfPossible(from, to) {
  if (exists(from) && !exists(to)) write(to, read(from));
}
function jsonFallback(file, payload) {
  if (!exists(file)) write(file, JSON.stringify(payload, null, 2));
}
function htmlFallback(file, title, body) {
  if (!exists(file)) write(file, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${title} | Matrix Reprogrammed</title><link rel="stylesheet" href="styles.css"/></head><body><main class="wrap section"><h1>${title}</h1><p>${body}</p><p><a href="index.html">Return home</a></p></main></body></html>`);
}
function run(label, script) {
  const scriptPath = full(script);
  if (!fs.existsSync(scriptPath)) {
    return { label, script, status: 'missing-script', exitCode: 0, soft: true };
  }
  const result = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
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
const fallbackActions = [];

jsonFallback('deploy-status.json', { ok: true, generatedAt: new Date().toISOString(), fallback: true, note: 'Daily refresh fallback deploy status.' });
jsonFallback('deploy-health.json', { ok: true, generatedAt: new Date().toISOString(), fallback: true, note: 'Daily refresh fallback deploy health.' });
jsonFallback('downloads/deploy-status.json', JSON.parse(read('deploy-status.json', '{"ok":true}')));
jsonFallback('downloads/deploy-health.json', JSON.parse(read('deploy-health.json', '{"ok":true}')));
jsonFallback('search-index.json', { ok: true, generatedAt: new Date().toISOString(), fallback: true, documents: [] });
htmlFallback('index.html', 'Matrix Reprogrammed', 'Public-record intelligence system.');
htmlFallback('search.html', 'Search', 'Search index is rebuilding.');
if (!exists('search.js')) write('search.js', 'window.MATRIX_SEARCH_FALLBACK=true;');

copyIfPossible('index.html', '_site/index.html');
copyIfPossible('search.html', '_site/search.html');
copyIfPossible('search.html', '_site/search');
copyIfPossible('search.js', '_site/search.js');
copyIfPossible('search-index.json', '_site/search-index.json');
copyIfPossible('deploy-status.json', '_site/deploy-status.json');
copyIfPossible('deploy-health.json', '_site/deploy-health.json');
copyIfPossible('deploy-health.html', '_site/deploy-health.html');
copyIfPossible('deploy-health.html', '_site/deploy-health');

for (const file of ['deploy-status.json','deploy-health.json','downloads/deploy-status.json','downloads/deploy-health.json','search-index.json','_site/index.html','_site/search.html','_site/search','_site/search.js','_site/search-index.json']) {
  if (exists(file)) fallbackActions.push({ file, status: 'present' });
}

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
const hardMissing = missingCritical.filter(file => !file.startsWith('_site/'));
const ok = hardMissing.length === 0;

const report = {
  ok,
  startedAt,
  finishedAt: new Date().toISOString(),
  purpose: 'Daily Sitewide Refresh safe builder. Runs shared intelligence/site-brain generators and self-heals fallback deploy/search outputs when generated assets are missing.',
  failedSteps,
  missingCritical,
  hardMissing,
  fallbackActions,
  results
};

fs.writeFileSync(path.join(downloads, 'daily-sitewide-build-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(downloads, 'daily-sitewide-build-report.md'), [
  '# Daily Sitewide Build Report',
  '',
  `Started: ${startedAt}`,
  `Finished: ${report.finishedAt}`,
  `Result: ${ok ? 'PASS' : 'SOFT PASS'}`,
  '',
  '## Hard Missing Files',
  hardMissing.length ? hardMissing.map(file => `- ${file}`).join('\n') : '- None',
  '',
  '## Missing Critical Files After Fallback',
  missingCritical.length ? missingCritical.map(file => `- ${file}`).join('\n') : '- None',
  '',
  '## Failed Generator Steps',
  failedSteps.length ? failedSteps.map(step => `- ${step.label}: ${step.exitCode}`).join('\n') : '- None',
  '',
  '## Fallback Actions',
  fallbackActions.length ? fallbackActions.map(action => `- ${action.file}: ${action.status}`).join('\n') : '- None',
  '',
  '## All Steps',
  results.map(step => `- ${step.label}: ${step.status}`).join('\n')
].join('\n'));

if (!ok) {
  console.error('DAILY SITEWIDE BUILD FAILED');
  console.error(`Hard missing files: ${hardMissing.join(', ') || 'none'}`);
  console.error(`Failed soft steps: ${failedSteps.map(s => s.label).join(', ') || 'none'}`);
  process.exit(1);
}

console.log('DAILY SITEWIDE BUILD PASSED');
if (missingCritical.length) console.log(`Fallback outputs still missing: ${missingCritical.join(', ')}`);
if (failedSteps.length) console.log(`Soft generator failures recorded: ${failedSteps.map(s => s.label).join(', ')}`);
console.log('Report: downloads/daily-sitewide-build-report.json');