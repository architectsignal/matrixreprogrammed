const fs = require('fs');
const path = require('path');

const root = process.cwd();

// Reassert the final release-metadata owner and deployable aliases at the last
// mutation boundary before Wrangler uploads the Worker and _site assets.
require('./patch-release-metadata-routing.js');
require('./publish-release-metadata-assets.js');

const site = path.join(root, '_site');
const hard = [];
const soft = [];
const source = rel => path.join(root, rel);
const built = rel => path.join(site, rel);
const exists = rel => fs.existsSync(source(rel));
const siteExists = rel => fs.existsSync(built(rel));
const read = rel => exists(rel) ? fs.readFileSync(source(rel), 'utf8') : '';
const siteRead = rel => siteExists(rel) ? fs.readFileSync(built(rel), 'utf8') : '';
const parse = (rel, fromSite = false) => {
  try { return JSON.parse(fromSite ? siteRead(rel) : read(rel)); }
  catch (error) { hard.push(`${fromSite ? '_site/' : ''}${rel} invalid JSON: ${error.message}`); return null; }
};
const need = rel => { if (!exists(rel)) hard.push(`missing source file: ${rel}`); };
const needSite = rel => { if (!siteExists(rel)) hard.push(`missing built asset: _site/${rel}`); };
const requireText = (rel, text, fromSite = false) => {
  const available = fromSite ? siteExists(rel) : exists(rel);
  if (!available || !(fromSite ? siteRead(rel) : read(rel)).includes(text)) hard.push(`${fromSite ? '_site/' : ''}${rel} missing ${text}`);
};
const forbidText = (rel, text, fromSite = false) => {
  const available = fromSite ? siteExists(rel) : exists(rel);
  if (available && (fromSite ? siteRead(rel) : read(rel)).includes(text)) hard.push(`${fromSite ? '_site/' : ''}${rel} contains forbidden ${text}`);
};
function duplicateIds(html) {
  const ids = [...String(html).matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

const requiredSource = [
  'index.html','start-here.html','membership.html','paypal-membership.js',
  'member-dashboard.html','member-dashboard-app.js','billing-dashboard.html','billing-dashboard.js',
  'admin-payment-dashboard.html','admin-payment-dashboard.js','live-intel.html',
  'daily-power-conclusions.html','daily-investigation-conclusions.html','daily-brain-brief.html','outcome-briefings.html',
  'security-privacy.html','dark-web-safety.html','geographic-power-atlas.html','data-lab.html','evidence-archive.html','search.html',
  'deploy-manifest.json','deploy-health.html','deploy-health.json','data/production-freshness-policy.json',
  'runtime/deploy-manifest-current.json','runtime/deploy-health-current.json',
  'src/worker.js','src/worker-forum-persistence.js','src/worker-member-experience.js','src/worker-paypal-subscriptions.js','src/worker-production.js','src/worker-release-metadata.js',
  'migrations/0004_forum_persistence.sql','migrations/phase5_member_experience.sql','migrations/phase6_paypal_subscriptions.sql',
  'scripts/build-production-health.js','scripts/final-production-reconcile.js','scripts/repair-generated-site-artifacts.js','scripts/cloudflare-focused-pressure-wrapper.js',
  'scripts/patch-release-metadata-routing.js','scripts/publish-release-metadata-assets.js',
  '.github/workflows/deploy.yml','.github/workflows/deploy-production.yml','.github/workflows/one-shot-dispatch-controlled-production.yml','wrangler.toml','wrangler.jsonc'
];
const requiredBuilt = [
  'index.html','index','start-here.html','start-here','membership.html','membership','paypal-membership.js',
  'member-dashboard.html','member-dashboard-app.js','billing-dashboard.html','billing-dashboard.js',
  'admin-payment-dashboard.html','admin-payment-dashboard.js','live-intel.html','live-intel',
  'daily-power-conclusions.html','daily-power-conclusions','daily-investigation-conclusions.html','daily-investigation-conclusions',
  'daily-brain-brief.html','daily-brain-brief','outcome-briefings.html','outcome-briefings',
  'security-privacy.html','security-privacy','dark-web-safety.html','dark-web-safety',
  'geographic-power-atlas.html','geographic-power-atlas','data-lab.html','data-lab','evidence-archive.html','evidence-archive','search.html','search',
  'deploy-manifest.json','deploy-manifest','deploy-health.html','deploy-health','deploy-health.json','downloads/deploy-health.json',
  'runtime/deploy-manifest-current.json','runtime/deploy-health-current.json'
];
requiredSource.forEach(need);
requiredBuilt.forEach(needSite);

for (const rel of ['index.html','start-here.html','membership.html','member-dashboard.html','billing-dashboard.html','admin-payment-dashboard.html','live-intel.html','daily-power-conclusions.html','daily-investigation-conclusions.html','daily-brain-brief.html','outcome-briefings.html','deploy-health.html']) {
  if (exists(rel)) {
    const duplicates = duplicateIds(read(rel));
    if (duplicates.length) hard.push(`${rel} duplicate IDs: ${duplicates.join(', ')}`);
  }
  if (siteExists(rel)) {
    const duplicates = duplicateIds(siteRead(rel));
    if (duplicates.length) hard.push(`_site/${rel} duplicate IDs: ${duplicates.join(', ')}`);
  }
}

requireText('index.html', 'Security Tools');
requireText('index.html', 'Dark Web Safety');
for (const marker of ['Free Member','€0','€3','€6','€9','paypal-membership.js','paypal-membership-status','Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.']) {
  requireText('membership.html', marker);
  requireText('membership.html', marker, true);
}
forbidText('membership.html', 'Coming soon — no payment taken');
forbidText('membership.html', 'Coming soon — no payment taken', true);
for (const marker of ['/api/paypal/subscription/create','Continue securely to PayPal','location.assign']) {
  requireText('paypal-membership.js', marker);
  requireText('paypal-membership.js', marker, true);
}
forbidText('paypal-membership.js', 'paypal.com/sdk/js');
forbidText('paypal-membership.js', 'paypal.com/sdk/js', true);
requireText('billing-dashboard.html', 'billing-dashboard.js');
requireText('admin-payment-dashboard.html', 'admin-payment-dashboard.js');
requireText('deploy-health.html', 'D1 AUTHORITATIVE / FAIL CLOSED');
requireText('deploy-health.html', 'Payments: RUNTIME GATED / DASHBOARD MANAGED');
requireText('deploy-health.html', 'D1 AUTHORITATIVE / FAIL CLOSED', true);
requireText('deploy-health.html', 'Payments: RUNTIME GATED / DASHBOARD MANAGED', true);

const expectedSha = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';
const manifest = exists('deploy-manifest.json') ? parse('deploy-manifest.json') : null;
const builtManifest = siteExists('deploy-manifest.json') ? parse('deploy-manifest.json', true) : null;
const runtimeManifest = exists('runtime/deploy-manifest-current.json') ? parse('runtime/deploy-manifest-current.json') : null;
const builtRuntimeManifest = siteExists('runtime/deploy-manifest-current.json') ? parse('runtime/deploy-manifest-current.json', true) : null;
const health = exists('deploy-health.json') ? parse('deploy-health.json') : null;
const builtHealth = siteExists('deploy-health.json') ? parse('deploy-health.json', true) : null;
const runtimeHealth = exists('runtime/deploy-health-current.json') ? parse('runtime/deploy-health-current.json') : null;
const builtRuntimeHealth = siteExists('runtime/deploy-health-current.json') ? parse('runtime/deploy-health-current.json', true) : null;
if (manifest && expectedSha && manifest.commitSha !== expectedSha) hard.push(`source deploy manifest SHA ${manifest.commitSha} does not match expected ${expectedSha}`);
if (builtManifest && expectedSha && builtManifest.commitSha !== expectedSha) hard.push(`built deploy manifest SHA ${builtManifest.commitSha} does not match expected ${expectedSha}`);
if (runtimeManifest && expectedSha && runtimeManifest.commitSha !== expectedSha) hard.push(`runtime deploy manifest SHA ${runtimeManifest.commitSha} does not match expected ${expectedSha}`);
if (builtRuntimeManifest && expectedSha && builtRuntimeManifest.commitSha !== expectedSha) hard.push(`built runtime deploy manifest SHA ${builtRuntimeManifest.commitSha} does not match expected ${expectedSha}`);
if (manifest && builtManifest && manifest.commitSha !== builtManifest.commitSha) hard.push('source and built deploy manifests disagree');
if (manifest && runtimeManifest && manifest.commitSha !== runtimeManifest.commitSha) hard.push('source and runtime deploy manifests disagree');
if (manifest && builtRuntimeManifest && manifest.commitSha !== builtRuntimeManifest.commitSha) hard.push('source and deployable runtime manifests disagree');
for (const [label, item] of [['source', health], ['built', builtHealth], ['runtime', runtimeHealth], ['built runtime', builtRuntimeHealth]]) {
  if (!item) continue;
  if (!item.ok) hard.push(`${label} production health reports not ready`);
  if (expectedSha && item.buildSha !== expectedSha) hard.push(`${label} production health SHA ${item.buildSha} does not match expected ${expectedSha}`);
  if (expectedSha && item.manifestSha !== expectedSha) hard.push(`${label} production health manifest SHA ${item.manifestSha} does not match expected ${expectedSha}`);
  if (item.workerScript !== 'src/worker-production.js') hard.push(`${label} production health does not name strict Worker`);
  if (item.paymentStatus !== 'runtime-gated-dashboard-managed') hard.push(`${label} production health does not report dashboard-managed runtime PayPal`);
  if (item.checkoutDefault !== 'runtime-d1-gated') hard.push(`${label} production health does not report D1-gated checkout`);
  if (!String(item.paymentMessage || '').includes('credentials') || !String(item.paymentMessage || '').includes('three active plans')) hard.push(`${label} production health does not describe all PayPal activation gates`);
}

const freshnessReport = exists('downloads/production-freshness-guard.json') ? parse('downloads/production-freshness-guard.json') : null;
if (!freshnessReport) hard.push('production freshness report missing');
else if (!freshnessReport.ok) hard.push(`production freshness guard reports ${freshnessReport.hardIssues?.length || 1} issue(s)`);

for (const text of ["import forumWorker from './worker-forum-persistence.js'","import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js'","import { isReleaseMetadataRoute, serveReleaseMetadata } from './worker-release-metadata.js';",'members-db-binding-unavailable','non-authoritative-forum-response-blocked','non-authoritative-paypal-response-blocked',"origin !== 'cloudflare-worker-forum-d1'","origin !== 'cloudflare-worker-paypal-subscriptions'",'isPayPalRoute(path)','if (isReleaseMetadataRoute(path)) return serveReleaseMetadata(request, env, path);']) {
  if (!read('src/worker-production.js').includes(text)) hard.push(`strict production Worker missing ${text}`);
}
for (const text of ["['/deploy-manifest.json', '/runtime/deploy-manifest-current.json']","['/deploy-health.json', '/runtime/deploy-health-current.json']",'cloudflare-worker-release-metadata','no-store, max-age=0']) {
  if (!read('src/worker-release-metadata.js').includes(text)) hard.push(`release metadata Worker missing ${text}`);
}
for (const text of ['cloudflare-worker-paypal-subscriptions','/api/paypal/subscription/create','/api/paypal/subscription/return','/v1/billing/subscriptions','/api/paypal/webhook','PAYPAL_SANDBOX_ENABLED','PAYPAL_PRODUCTION_ENABLED','PAYPAL_LIVE_ACTIVATION_CONFIRMATION','paypal_runtime_settings']) {
  if (!read('src/worker-paypal-subscriptions.js').includes(text)) hard.push(`PayPal Worker missing ${text}`);
}

const wranglerToml = read('wrangler.toml');
const wranglerJsonc = read('wrangler.jsonc');
for (const text of ['main = "src/worker-production.js"','binding = "FORUM_POSTS"','binding = "MEMBERS_DB"','directory = "./_site"','run_worker_first = true','keep_vars = true']) {
  if (!wranglerToml.includes(text)) hard.push(`wrangler.toml missing ${text}`);
}
for (const text of ['"main": "src/worker-production.js"','"binding": "FORUM_POSTS"','"binding": "MEMBERS_DB"','"keep_vars": true']) {
  if (!wranglerJsonc.includes(text)) hard.push(`wrangler.jsonc missing ${text}`);
}
if (/^PAYPAL_[A-Z0-9_]+\s*=/m.test(wranglerToml)) hard.push('wrangler.toml contains active PAYPAL_* overrides');
if (/"PAYPAL_[A-Z0-9_]+"\s*:/.test(wranglerJsonc)) hard.push('wrangler.jsonc contains active PAYPAL_* overrides');

const canonicalDeploy = read('.github/workflows/deploy.yml');
const fallbackDeploy = read('.github/workflows/deploy-production.yml');
const dispatchDeploy = read('.github/workflows/one-shot-dispatch-controlled-production.yml');
const legacyRepair = read('scripts/repair-generated-site-artifacts.js');
const regressionWrapper = read('scripts/cloudflare-focused-pressure-wrapper.js');
const explicitFreeze = text => /HARD FREEZE|PRODUCTION DEPLOYMENT LOCKED|MANUAL FALLBACK DEPLOYMENT LOCKED|PRODUCTION DISPATCH LOCKED/i.test(text);
const executableDeployCommand = /^\s*(?:-\s*)?(?:run:\s*)?(?:npx(?:\s+--yes)?\s+)?wrangler(?:@latest)?\s+(?:deploy|pages\s+deploy)\b/im;
const d1MutationCommand = /\b(?:npx(?:\s+--yes)?\s+)?wrangler(?:@latest)?\s+d1\s+(?:execute|migrations\s+apply)\b|checkout_enabled\s*=/i;
const hardFreeze = [canonicalDeploy, fallbackDeploy, dispatchDeploy].every(explicitFreeze);
if (hardFreeze) {
  for (const [label, workflow] of [['canonical', canonicalDeploy], ['fallback', fallbackDeploy], ['dispatcher', dispatchDeploy]]) {
    if (!workflow.includes('workflow_dispatch:') || /^\s*(?:push|pull_request|schedule):/m.test(workflow)) hard.push(`${label} frozen workflow must be manual only`);
    if (!explicitFreeze(workflow)) hard.push(`${label} production workflow is not explicitly frozen`);
    if (executableDeployCommand.test(workflow)) hard.push(`${label} frozen workflow contains executable Wrangler deployment`);
    if (d1MutationCommand.test(workflow)) hard.push(`${label} frozen workflow contains D1 or checkout mutation`);
    if (workflow.includes('PAYPAL_PRODUCTION_ENABLED=true') || workflow.includes('ACTIVATE MATRIX PAYPAL LIVE')) hard.push(`${label} frozen workflow can activate live PayPal`);
  }
  for (const rel of ['scripts/final-production-reconcile.js','scripts/verify-live-production.js','src/worker-production.js','migrations/phase4_email_lifecycle.sql','migrations/phase5_member_experience.sql','migrations/phase6_paypal_subscriptions.sql','migrations/phase7_paypal_sandbox_rehearsal.sql']) {
    if (!exists(rel)) hard.push(`frozen release readiness missing ${rel}`);
  }
} else {
  if (!canonicalDeploy.includes('workflow_dispatch:') || /^\s*(?:push|pull_request):/m.test(canonicalDeploy)) hard.push('canonical deploy must be manually dispatched only');
  if (!canonicalDeploy.includes('DEPLOY MATRIX REPROGRAMMED') || !canonicalDeploy.includes('Production release refused: confirmation text did not match.')) hard.push('canonical deploy missing exact owner confirmation gate');
  if (!canonicalDeploy.includes('group: matrixreprogrammed-production') || !/cancel-in-progress:\s*false/.test(canonicalDeploy)) hard.push('canonical deploy must queue and never interrupt D1 migrations');
  if (!canonicalDeploy.includes('d1 time-travel info matrix-members --json') || !canonicalDeploy.includes('d1-rollback-proof.json') || !canonicalDeploy.includes('restoreCommand') || canonicalDeploy.includes('d1 export matrix-members --remote')) hard.push('canonical deploy missing validated D1 Time Travel rollback');
  if (!canonicalDeploy.includes('Sandbox checkout must remain closed outside an explicit rehearsal') || !canonicalDeploy.includes('live checkout state preserved')) hard.push('canonical deploy does not preserve live PayPal state while closing sandbox');

  if (!fallbackDeploy.includes('workflow_dispatch:') || /^\s*(?:push|pull_request|schedule):/m.test(fallbackDeploy)) hard.push('manual fallback must remain manual only');
  if (!explicitFreeze(fallbackDeploy)) hard.push('manual fallback must remain explicitly hard frozen');
  if (executableDeployCommand.test(fallbackDeploy)) hard.push('manual fallback contains executable Wrangler deployment');
  if (d1MutationCommand.test(fallbackDeploy)) hard.push('manual fallback contains D1 or checkout mutation');
  if (fallbackDeploy.includes('PAYPAL_PRODUCTION_ENABLED=true') || fallbackDeploy.includes('ACTIVATE MATRIX PAYPAL LIVE')) hard.push('manual fallback must not activate live PayPal');

  if (executableDeployCommand.test(dispatchDeploy)) hard.push('dispatcher contains a direct Cloudflare deployment command');
  if (d1MutationCommand.test(dispatchDeploy)) hard.push('dispatcher contains D1 or checkout mutation');
  if (dispatchDeploy.includes('PAYPAL_PRODUCTION_ENABLED=true') || dispatchDeploy.includes('ACTIVATE MATRIX PAYPAL LIVE')) hard.push('dispatcher must not activate live PayPal');
}
if (!legacyRepair.includes("productionHealthOwner: 'scripts/build-production-health.js'")) hard.push('legacy repair does not acknowledge canonical health owner');
if (legacyRepair.includes("workerScript: 'src/worker.js'") || legacyRepair.includes("write('deploy-health.json'")) hard.push('legacy repair still writes obsolete production health');
if (!regressionWrapper.includes('final-production-reconcile.js')) hard.push('Cloudflare regression wrapper missing final reconciliation');
if (!regressionWrapper.includes('runtime-gated-dashboard-managed')) hard.push('Cloudflare regression wrapper does not enforce runtime-gated PayPal readiness');

if (siteExists('_redirects')) hard.push('_site/_redirects must not be deployed for Worker assets');

const report = {
  ok: hard.length === 0,
  generatedAt: new Date().toISOString(),
  expectedSha,
  manifestSha: manifest?.commitSha || null,
  builtManifestSha: builtManifest?.commitSha || null,
  runtimeManifestSha: runtimeManifest?.commitSha || null,
  builtRuntimeManifestSha: builtRuntimeManifest?.commitSha || null,
  healthSha: health?.buildSha || null,
  builtHealthSha: builtHealth?.buildSha || null,
  runtimeHealthSha: runtimeHealth?.buildSha || null,
  builtRuntimeHealthSha: builtRuntimeHealth?.buildSha || null,
  hardIssues: hard,
  softIssues: soft,
  deploymentMode: hardFreeze ? 'hard-freeze' : 'deployment-enabled',
  deploymentModel: hardFreeze
    ? 'Cloudflare production is hard frozen. Canonical, fallback and dispatcher workflows are manual, inert and mutation-free while Git intelligence updates continue.'
    : 'One manually confirmed canonical release is active. The fallback remains hard frozen and the dispatcher cannot mutate Cloudflare or D1 directly.',
  rollbackModel: hardFreeze
    ? 'No D1 migration is permitted while frozen; migration and rollback readiness assets remain preserved for a future explicitly restored deployment workflow.'
    : 'The canonical release captures a validated Cloudflare D1 Time Travel bookmark before migrations with an exact restore command.',
  productionHealthOwner: 'scripts/build-production-health.js via final-production-reconcile.js',
  releaseMetadataOwner: 'src/worker-release-metadata.js with exact runtime aliases republished at the final pre-Wrangler guard.',
  forumPersistence: 'Cloudflare D1 is authoritative behind a strict fail-closed production Worker.',
  paymentStatus: 'PayPal runtime values are dashboard-managed and deployment-preserved; the Worker creates subscriptions and redirects to the official approval URL while checkout still requires credentials, the matching environment switch, D1 activation, live confirmation and three active plans.',
  boundary: hardFreeze
    ? 'Production is blocked unless all three workflow locks are deliberately replaced. Any executable Wrangler deploy, D1 mutation, automatic trigger or PayPal activation inside a frozen workflow fails this guard.'
    : 'Deployment is blocked on automatic canonical triggers, missing owner confirmation, interruptible canonical migration concurrency, missing rollback protection, a mutable fallback, direct dispatcher mutation, legacy health overwrite, stale or absent release metadata aliases, stale routes or data, health/SHA drift, false-success forum fallback, repository PayPal overrides, browser SDK reintroduction or unguarded payment activation.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-deploy-guard-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'production-deploy-guard-report.md'), `# Production Deploy Guard\n\nGenerated: ${report.generatedAt}\nResult: ${report.ok ? 'PASS' : 'FAIL'}\nExpected SHA: ${expectedSha}\nManifest SHA: ${report.manifestSha}\nHealth SHA: ${report.healthSha}\nDeployment mode: ${report.deploymentMode}\nDeployment model: ${report.deploymentModel}\nRollback: ${report.rollbackModel}\nRelease metadata: ${report.releaseMetadataOwner}\nForum storage: ${report.forumPersistence}\nPayments: ${report.paymentStatus}\n\n## Hard Issues\n${hard.map(issue => `- ${issue}`).join('\n') || '- None'}\n`);
if (hard.length) {
  console.error('PRODUCTION DEPLOY GUARD FAILED');
  hard.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(hardFreeze
  ? `PRODUCTION DEPLOY GUARD PASSED for ${String(expectedSha).slice(0, 12)}: production workflows are hard frozen, mutation-free and release readiness remains preserved.`
  : `PRODUCTION DEPLOY GUARD PASSED for ${String(expectedSha).slice(0, 12)} with final release metadata aliases, manual confirmation, a non-interrupting canonical migration queue, Time Travel rollback, frozen fallback, strict D1 forums and SDK-free runtime-gated PayPal.`);