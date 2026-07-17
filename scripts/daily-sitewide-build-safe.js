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
  ['newsletter-d1-health', 'scripts/newsletter-persistence-test.js'],
  ['critical-route-drift', 'scripts/repair-critical-route-drift.js'],
  ['shared-assets', 'scripts/ensure-shared-assets.js'],
  ['search-repair-final', 'scripts/repair-search-system.js'],
  ['membership-tiers-final', 'scripts/patch-membership-tiers.js'],
  ['newsletter-consent-final', 'scripts/patch-newsletter-consent.js'],
  ['login-email-delivery-final', 'scripts/patch-login-email-delivery.js'],
  ['homepage-mission-final', 'scripts/normalize-homepage-mission-copy.js'],
  ['critical-route-drift-final', 'scripts/repair-critical-route-drift.js'],
  ['worker-pages-origin', 'scripts/patch-worker-pages-origin.js'],
  ['cloudflare-output', 'scripts/build-cloudflare-output.js'],
  ['membership-tiers-output-final', 'scripts/patch-membership-tiers.js'],
  ['homepage-mission-output-final', 'scripts/normalize-homepage-mission-copy.js'],
  ['search-index-output-final', 'scripts/compact-cloudflare-search-index.js'],
  ['site-brain-health', 'scripts/site-brain-health.js'],
  ['site-function-harmony', 'scripts/site-function-harmony-test.js'],
  ['shared-assets-final', 'scripts/ensure-shared-assets.js']
];

function full(file) { return path.join(root, file); }
function exists(file) { return fs.existsSync(full(file)); }
function read(file, fallback = '') { try { return exists(file) ? fs.readFileSync(full(file), 'utf8') : fallback; } catch { return fallback; } }
function safeJson(file, fallback) { try { return JSON.parse(read(file, JSON.stringify(fallback))); } catch { return fallback; } }
function write(file, value) { fs.mkdirSync(path.dirname(full(file)), { recursive: true }); fs.writeFileSync(full(file), value); }

const fallbackActions = [];
function copyIfPossible(from, to) {
  try {
    if (exists(from) && !exists(to)) {
      write(to, read(from));
      fallbackActions.push({ file: to, status: 'copied-fallback' });
    }
  } catch (error) {
    fallbackActions.push({ file: to, status: 'copy-failed', error: error.message });
  }
}
function jsonFallback(file, payload) {
  try {
    if (!exists(file)) {
      write(file, JSON.stringify(payload, null, 2));
      fallbackActions.push({ file, status: 'created-fallback' });
    }
  } catch (error) {
    fallbackActions.push({ file, status: 'json-fallback-failed', error: error.message });
  }
}
function htmlFallback(file, title, body) {
  try {
    if (!exists(file)) {
      write(file, `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${title} | Matrix Reprogrammed</title><link rel="stylesheet" href="styles.css"/></head><body><main class="wrap section"><h1>${title}</h1><p>${body}</p><p><a href="index.html">Return home</a></p></main></body></html>`);
      fallbackActions.push({ file, status: 'created-fallback' });
    }
  } catch (error) {
    fallbackActions.push({ file, status: 'html-fallback-failed', error: error.message });
  }
}
function run(label, script) {
  if (!exists(script)) return { label, script, status: 'missing-script', exitCode: 1, stdout: '', stderr: `${script} missing` };
  try {
    const result = spawnSync(process.execPath, [full(script)], { cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: 30 * 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return {
      label,
      script,
      status: result.status === 0 ? 'ok' : 'failed',
      exitCode: result.status === null ? 1 : result.status,
      stdout: String(result.stdout || '').slice(-3000),
      stderr: String(result.stderr || '').slice(-3000)
    };
  } catch (error) {
    return { label, script, status: 'exception', exitCode: 1, stdout: '', stderr: error.message };
  }
}

const results = steps.map(([label, script]) => run(label, script));
const now = new Date().toISOString();

jsonFallback('deploy-status.json', { ok: false, generatedAt: now, fallback: true, note: 'Daily refresh fallback deploy status; not production proof.' });
jsonFallback('deploy-health.json', { ok: false, generatedAt: now, fallback: true, note: 'Daily refresh fallback deploy health; validation required.' });
jsonFallback('downloads/deploy-status.json', safeJson('deploy-status.json', { ok: false, generatedAt: now, fallback: true }));
jsonFallback('downloads/deploy-health.json', safeJson('deploy-health.json', { ok: false, generatedAt: now, fallback: true }));
jsonFallback('search-index.json', []);
jsonFallback('data/daily-sitewide-refresh-status.json', { ok: false, generatedAt: now, fallback: true, note: 'Refresh outputs were created by fallback; inspect the build report.' });
htmlFallback('index.html', 'Matrix Reprogrammed', 'Public-record intelligence system.');
htmlFallback('search.html', 'Search', 'Search index is rebuilding.');
if (!exists('search.js')) {
  write('search.js', 'window.MATRIX_SEARCH_FALLBACK=true;');
  fallbackActions.push({ file: 'search.js', status: 'created-fallback' });
}

copyIfPossible('index.html', '_site/index.html');
copyIfPossible('search.html', '_site/search.html');
copyIfPossible('search.html', '_site/search');
copyIfPossible('search.js', '_site/search.js');
copyIfPossible('search-index.json', '_site/search-index.json');
copyIfPossible('deploy-status.json', '_site/deploy-status.json');
copyIfPossible('deploy-health.json', '_site/deploy-health.json');
copyIfPossible('deploy-health.html', '_site/deploy-health.html');
copyIfPossible('deploy-health.html', '_site/deploy-health');
copyIfPossible('data/daily-sitewide-refresh-status.json', '_site/data/daily-sitewide-refresh-status.json');

const criticalFiles = [
  'index.html','search.html','search.js','search-index.json','deploy-status.json','deploy-health.json',
  'downloads/deploy-status.json','downloads/deploy-health.json','data/daily-sitewide-refresh-status.json',
  '_site/index.html','_site/search.html','_site/search','_site/search.js','_site/search-index.json',
  'downloads/newsletter-persistence-test.json','downloads/critical-route-drift-report.json','downloads/site-function-harmony-report.json',
  'downloads/cloudflare-search-index-compaction.json','downloads/membership-tiers-report.json','downloads/homepage-mission-normalization.json'
];
const missingCritical = criticalFiles.filter(file => !exists(file));
const hardMissing = missingCritical.filter(file => !file.startsWith('_site/'));
const failedSteps = results.filter(step => step.status !== 'ok');
const fallbackUsed = fallbackActions.some(action => /fallback/.test(action.status));
const ok = failedSteps.length === 0 && hardMissing.length === 0 && !fallbackUsed;
const status = ok ? 'passed' : hardMissing.length || failedSteps.length ? 'failed' : 'degraded';

const report = {
  ok,
  resilient: true,
  status,
  startedAt,
  finishedAt: new Date().toISOString(),
  purpose: 'Daily Sitewide Refresh builder. It preserves the canonical D1 membership/email lifecycle, homepage mission, compact Cloudflare search asset and emergency fallbacks. Fallbacks and failed generators are reported as unhealthy rather than green.',
  failedSteps,
  missingCritical,
  hardMissing,
  fallbackUsed,
  fallbackActions,
  results
};

fs.writeFileSync(path.join(downloads, 'daily-sitewide-build-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(downloads, 'daily-sitewide-build-report.md'), [
  '# Daily Sitewide Build Report','',
  `Started: ${startedAt}`,
  `Finished: ${report.finishedAt}`,
  `Result: ${status.toUpperCase()}`,'',
  '## Failed Generator Steps',
  failedSteps.length ? failedSteps.map(step => `- ${step.label}: ${step.exitCode} ${step.status}`).join('\n') : '- None','',
  '## Hard Missing Files',
  hardMissing.length ? hardMissing.map(file => `- ${file}`).join('\n') : '- None','',
  '## Fallback Actions',
  fallbackActions.length ? fallbackActions.map(action => `- ${action.file}: ${action.status}`).join('\n') : '- None','',
  '## All Steps',
  results.map(step => `- ${step.label}: ${step.status}`).join('\n')
].join('\n'));

const refreshStatus = { ok, status, resilient: true, fallbackUsed, failedSteps: failedSteps.map(step => step.label), hardMissing, generatedAt: report.finishedAt, report: '/downloads/daily-sitewide-build-report.json' };
write('data/daily-sitewide-refresh-status.json', JSON.stringify(refreshStatus, null, 2));
if (exists('_site/data')) write('_site/data/daily-sitewide-refresh-status.json', JSON.stringify(refreshStatus, null, 2));

console.log(`DAILY SITEWIDE BUILD ${status.toUpperCase()}`);
console.log('Report: downloads/daily-sitewide-build-report.json');
if (!ok) process.exit(1);
