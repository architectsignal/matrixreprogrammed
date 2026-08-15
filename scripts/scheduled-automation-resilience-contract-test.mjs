import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
let checks = 0;
const need = (condition, message) => { checks += 1; if (!condition) failures.push(message); };
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const files = [
  'scripts/daily-sitewide-build-safe.js',
  '.github/workflows/daily-sitewide-refresh.yml',
  'scripts/site-brain-health.js',
  'scripts/finalize-search-first-accountability-home.js',
  'data/site-brain.json',
  '.github/workflows/daily-update-check.yml',
  'scripts/live-intel-pressure-test.js',
  'scripts/publish-investigation-matrix-events.mjs',
  'scripts/publish-investigation-matrix-events.test.mjs',
  '.github/workflows/daily-investigation-machine.yml',
  '.github/workflows/weekly-investigation-machine.yml',
  '.github/workflows/performance-deploy-handoff.yml',
  '.github/workflows/production-runtime-rehearsal.yml'
];
for (const relative of files) need(fs.existsSync(path.join(root, relative)), `missing scheduled automation contract file: ${relative}`);

for (const relative of [
  'scripts/daily-sitewide-build-safe.js',
  'scripts/site-brain-health.js',
  'scripts/finalize-search-first-accountability-home.js',
  'scripts/live-intel-pressure-test.js',
  'scripts/publish-investigation-matrix-events.mjs',
  'scripts/publish-investigation-matrix-events.test.mjs'
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { cwd: root, encoding: 'utf8' });
  need(result.status === 0, `${relative} syntax failed: ${result.stderr || result.stdout || result.status}`);
}

if (!failures.length) {
  const builder = read('scripts/daily-sitewide-build-safe.js');
  need(!builder.includes("jsonFallback('data/daily-sitewide-refresh-status.json'"), 'the daily builder must not classify its own status output as an emergency fallback');
  need(builder.includes("write('data/daily-sitewide-refresh-status.json'"), 'the daily builder must publish its truthful final status');
  need(builder.includes("if (exists('_site')) write('_site/data/daily-sitewide-refresh-status.json'"), 'the daily builder must mirror final status into deployable output');
  const sitewideWorkflow = read('.github/workflows/daily-sitewide-refresh.yml');
  need(sitewideWorkflow.indexOf('daily-sitewide-build-safe.js') < sitewideWorkflow.indexOf('automation-health-gate.js'), 'daily sitewide refresh must build its report before enforcing the truthful health gate');

  const packageScripts = JSON.parse(read('package.json')).scripts;
  for (const scriptName of ['build', 'site-brain', 'pressure-test:cloudflare']) {
    const command = String(packageScripts[scriptName] || '');
    const outputOwner = command.indexOf('build-cloudflare-output.js');
    const homepageOwner = command.indexOf('reconcile-release-homepage-order.js');
    const healthGate = command.indexOf('site-brain-health.js');
    need(outputOwner >= 0 && homepageOwner > outputOwner && healthGate > homepageOwner, `${scriptName} must restore the canonical homepage after packaging and before Site Brain health`);
  }

  const brain = JSON.parse(read('data/site-brain.json'));
  need(Number(brain.version) >= 4, 'site brain contract version must describe the stable search-first homepage identity');
  need(brain.freshness?.homepageCurrentMarker === 'id="accountability-search"', 'site brain current marker must match the canonical functional search route');
  need(brain.criticalRoutes?.some(route => route.path === '/' && route.marker === 'id="accountability-search"'), 'root route health marker must match the canonical functional search route');
  const health = read('scripts/site-brain-health.js');
  for (const marker of ['search-first-accountability', 'id="accountability-search"', 'id="accountability-hit-list"', 'id="open-question-ledger"', 'acceptedHomepageMarkers']) {
    need(health.includes(marker), `site brain health is missing search-first contract marker: ${marker}`);
  }
  need(health.includes("toLocaleUpperCase('en-US')"), 'site brain homepage marker comparison must be case-insensitive across final generators');
  need(read('scripts/finalize-search-first-accountability-home.js').includes("['book-universe.html','Book Universe']"), 'canonical homepage owner must preserve Book Universe navigation before Site Brain health');

  const daily = read('.github/workflows/daily-update-check.yml');
  const homepageOwner = daily.indexOf('reconcile-release-homepage-order.js');
  const dockOwner = daily.indexOf('reconcile-global-access-dock.cjs');
  const freshnessGate = daily.indexOf('live-intel-pressure-test.js');
  need(homepageOwner >= 0 && dockOwner > homepageOwner && freshnessGate > dockOwner, 'daily content refresh must reconcile homepage and dock before freshness validation');

  const publisher = read('scripts/publish-investigation-matrix-events.mjs');
  for (const marker of ['CANONICAL_WORKER_HOST', 'knownCloudflareChallenge', "reason: 'known-cloudflare-challenge'", 'fallbackSiteUrl', 'transportFallbacks']) {
    need(publisher.includes(marker), `Living Matrix publisher is missing strict fallback marker: ${marker}`);
  }
  const publisherTest = read('scripts/publish-investigation-matrix-events.test.mjs');
  need(publisherTest.includes('unrecognizedFallbackCalls'), 'publisher tests must prove ordinary 403 responses do not fall back');
  need(publisherTest.includes('https://untrusted.example'), 'publisher tests must prove untrusted fallback hosts are rejected');
  for (const workflow of ['.github/workflows/daily-investigation-machine.yml', '.github/workflows/weekly-investigation-machine.yml']) {
    const workflowText = read(workflow);
    need(workflowText.includes('SITE_FALLBACK_URL: https://matrixreprogrammed.njmgroupfrance.workers.dev'), `${workflow} is missing the canonical Worker fallback`);
    need(workflowText.includes('environment: production'), `${workflow} must use the production-scoped admin secret for authenticated live publication`);
  }

  const performanceHandoff = read('.github/workflows/performance-deploy-handoff.yml');
  need(!/(^|\n)\s*(?:actions|contents):\s*write\s*$/m.test(performanceHandoff), 'performance handoff must not have repository write or workflow-dispatch permission');
  need(!/\bgh\s+workflow\s+run\b/.test(performanceHandoff), 'performance handoff must not autonomously dispatch production');
  need(!/\bgit\s+push\b/.test(performanceHandoff), 'performance handoff must not autonomously write to main');
  need(performanceHandoff.includes('validated-owner-dispatch-required'), 'performance handoff must record the owner-controlled release boundary');
  need(performanceHandoff.includes('actions/upload-artifact@v4'), 'performance handoff must preserve its validation receipt as an artifact');

  const runtimeRehearsal = read('.github/workflows/production-runtime-rehearsal.yml');
  need(!/(^|\n)\s*contents:\s*write\s*$/m.test(runtimeRehearsal), 'production runtime rehearsal must not have repository write permission');
  need(!/\bgit\s+push\b/.test(runtimeRehearsal), 'production runtime rehearsal must not autonomously write to main');
  need(!/\bgit\s+(?:reset|clean)\b/.test(runtimeRehearsal), 'production runtime rehearsal must not destructively rewrite its checkout');
  need(runtimeRehearsal.includes('Record rehearsal status for the immutable run artifact'), 'production runtime rehearsal must record status only for its immutable run artifact');
  need(runtimeRehearsal.includes('actions/upload-artifact@v4'), 'production runtime rehearsal must preserve its proof as an artifact');
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  boundary: 'Scheduled automation may retry only the canonical Worker after a recognized Cloudflare managed challenge. Homepage, freshness and status owners must be reasserted before a workflow can report success.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'scheduled-automation-resilience-contract.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('SCHEDULED AUTOMATION RESILIENCE CONTRACT FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`SCHEDULED AUTOMATION RESILIENCE CONTRACT PASSED: ${checks} checks.`);
