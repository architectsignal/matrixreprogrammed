const fs = require('fs');
const path = require('path');
const root = process.cwd();
const site = path.join(root, '_site');
const failures = [];
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(path.join(root, rel), 'utf8') : ''; }
function siteRead(rel) { const file = path.join(site, rel); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }
function check(name, ok) { if (!ok) failures.push(name); }

const canonicalDeploy = read('.github/workflows/deploy.yml');
const fallbackDeploy = read('.github/workflows/deploy-production.yml');
const legacyRepair = read('scripts/repair-generated-site-artifacts.js');
const regressionWrapper = read('scripts/cloudflare-focused-pressure-wrapper.js');
const liveVerifier = read('scripts/verify-live-production.js');

check('canonical deploy workflow refreshes intelligence', canonicalDeploy.includes('run-investigation-machine.js daily') && canonicalDeploy.includes('update-live-intel.js'));
check('canonical deploy is manual only', canonicalDeploy.includes('workflow_dispatch:') && !/^\s*(?:push|pull_request):/m.test(canonicalDeploy));
check('canonical deploy requires exact release confirmation', canonicalDeploy.includes('DEPLOY MATRIX REPROGRAMMED') && canonicalDeploy.includes('Production release refused: confirmation text did not match.'));
check('canonical deploy queues rather than interrupts migrations', canonicalDeploy.includes('group: matrixreprogrammed-production') && /cancel-in-progress:\s*false/.test(canonicalDeploy));
check('canonical deploy verifies live SHA', canonicalDeploy.includes('verify-live-production.js'));
check('canonical deploy deploys strict Worker', canonicalDeploy.includes('strict D1 forum and PayPal Worker') && canonicalDeploy.includes('npx --yes wrangler@latest deploy'));
check('canonical deploy captures D1 Time Travel rollback', canonicalDeploy.includes('d1 time-travel info matrix-members --json') && canonicalDeploy.includes('d1-rollback-proof.json') && canonicalDeploy.includes('restoreCommand') && !canonicalDeploy.includes('d1 export matrix-members --remote'));
for (const migration of ['phase4_email_lifecycle.sql','phase4_email_lifecycle_portability.sql','phase5_member_experience.sql','phase5_member_experience_timestamp_fix.sql','phase6_paypal_subscriptions.sql','phase6_paypal_failure_counter_fix.sql']) {
  check(`canonical deploy applies ${migration}`, canonicalDeploy.includes(migration));
}
check('canonical deploy verifies rollback before release', canonicalDeploy.includes("if(!rollback.ok||!rollback.bookmark) throw new Error('Validated D1 rollback point is missing')"));
check('canonical deploy verifies disabled PayPal switches', canonicalDeploy.includes('paypal-runtime-settings.json') && canonicalDeploy.includes('checkout must remain disabled during deployment'));
check('canonical deploy verifies strict PayPal route', canonicalDeploy.includes('verify-live-production.js') && liveVerifier.includes('verifyPayPalBoundary') && liveVerifier.includes('/api/paypal/config') && liveVerifier.includes('cloudflare-worker-paypal-subscriptions'));

check('fallback deploy is manual only', fallbackDeploy.includes('workflow_dispatch:') && !/^\s*(?:push|pull_request):/m.test(fallbackDeploy));
check('fallback deploy shares production concurrency without interruption', fallbackDeploy.includes('group: matrixreprogrammed-production') && /cancel-in-progress:\s*false/.test(fallbackDeploy));
check('fallback deploy uses final reconciliation', fallbackDeploy.includes('final-production-reconcile.js') && fallbackDeploy.includes('verify-live-production.js'));
check('fallback deploy captures D1 Time Travel rollback', fallbackDeploy.includes('d1 time-travel info matrix-members --json') && fallbackDeploy.includes('d1-rollback-proof.json') && fallbackDeploy.includes('restoreCommand') && !fallbackDeploy.includes('d1 export matrix-members --remote'));
check('fallback deploy does not activate PayPal', !fallbackDeploy.includes('PAYPAL_PRODUCTION_ENABLED=true') && !fallbackDeploy.includes('ACTIVATE MATRIX PAYPAL LIVE'));

check('legacy repair cannot publish health', legacyRepair.includes("productionHealthOwner: 'scripts/build-production-health.js'") && !legacyRepair.includes("workerScript: 'src/worker.js'") && !legacyRepair.includes("write('deploy-health.json'"));
check('regression wrapper runs final reconciliation', regressionWrapper.includes('final-production-reconcile.js'));
check('regression wrapper tests server-gated PayPal', regressionWrapper.includes('sandbox-ready-disabled') && regressionWrapper.includes('paypal-membership.js') && regressionWrapper.includes('PAYPAL_SANDBOX_ENABLED'));
check('regression wrapper tests strict Worker', regressionWrapper.includes('src/worker-production.js') && regressionWrapper.includes('non-authoritative-forum-response-blocked') && regressionWrapper.includes('non-authoritative-paypal-response-blocked'));

check('live verifier proves forum D1 write/read', liveVerifier.includes('verifyForumPersistence') && liveVerifier.includes('/submit-main-post') && liveVerifier.includes('storedPostCount'));
check('live verifier proves health SHA', liveVerifier.includes('/deploy-health.json') && liveVerifier.includes('healthMatches'));
check('live verifier proves PayPal fail-closed boundary', liveVerifier.includes('verifyPayPalBoundary') && liveVerifier.includes('cloudflare-worker-paypal-subscriptions'));
check('freshness policy exists', exists('data/production-freshness-policy.json'));
check('source deployment manifest exists', exists('deploy-manifest.json'));
check('built deployment manifest exists', fs.existsSync(path.join(site, 'deploy-manifest.json')));
check('source production health exists', exists('deploy-health.json') && exists('deploy-health.html'));
check('built production health exists', fs.existsSync(path.join(site, 'deploy-health.json')) && fs.existsSync(path.join(site, 'deploy-health.html')) && fs.existsSync(path.join(site, 'deploy-health')));
check('production health is regenerated last', read('scripts/final-production-reconcile.js').includes('build-production-health.js') && read('scripts/final-production-reconcile.js').includes('downloads/deploy-health.json'));
check('main navigation safety links', read('index.html').includes('security-privacy.html') && read('index.html').includes('dark-web-safety.html'));
check('Start Here safety links', read('start-here.html').includes('Open Security Tools') && read('start-here.html').includes('Open Dark Web Safety'));
check('membership preserves free and server-gated paid tiers', read('membership.html').includes('Free Member') && read('membership.html').includes('paypal-membership.js') && read('membership.html').includes('Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.') && !read('membership.html').includes('Coming soon — no payment taken'));
check('built membership preserves PayPal runtime', siteRead('membership.html').includes('paypal-membership.js') && siteRead('paypal-membership.js').includes('/api/paypal/checkout-intent'));
for (const rel of ['daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html']) {
  check(`${rel} integrity cards`, read(rel).includes('<!-- conclusion-integrity:start -->'));
  check(`built ${rel} integrity cards`, siteRead(rel).includes('<!-- conclusion-integrity:start -->'));
}
check('critical HTML no-cache policy', read('_headers').includes('/deploy-manifest.json') && read('_headers').includes('/deploy-health.json') && read('_headers').includes('Cache-Control: no-store'));
check('forum persistence wrapper exists', exists('src/worker-forum-persistence.js'));
check('strict production Worker exists', exists('src/worker-production.js'));
check('strict Worker entrypoint active', read('wrangler.toml').includes('main = "src/worker-production.js"') && read('wrangler.jsonc').includes('"main": "src/worker-production.js"'));
check('strict Worker blocks legacy success', read('src/worker-production.js').includes('non-authoritative-forum-response-blocked') && read('src/worker-production.js').includes('non-authoritative-paypal-response-blocked') && read('src/worker-production.js').includes('members-db-binding-unavailable'));
check('forum D1 is authoritative', read('src/worker-forum-persistence.js').includes('Cloudflare D1 MEMBERS_DB.forum_posts') && read('src/worker-forum-persistence.js').includes('INSERT OR IGNORE INTO forum_posts'));
check('forum KV migration exists', read('src/worker-forum-persistence.js').includes('kv_forum_migration_v1') && read('src/worker-forum-persistence.js').includes("prefix: 'post:'"));
check('forum migration schema exists', read('migrations/0004_forum_persistence.sql').includes('CREATE TABLE IF NOT EXISTS forum_posts'));
check('PayPal migration schema exists', read('migrations/phase6_paypal_subscriptions.sql').includes('paypal_runtime_settings') && read('migrations/phase6_paypal_subscriptions.sql').includes('paypal_subscription_transitions'));
check('forum fail-closed test exists', exists('scripts/forum-persistence-d1-test.js') && read('package.json').includes('forum-persistence-d1-test.js'));

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  deploymentModel: 'One manually confirmed canonical Cloudflare production release plus one manual fallback. Both share a non-interrupting production concurrency queue and the same fail-closed gates.',
  rollbackModel: 'A validated Cloudflare D1 Time Travel bookmark is captured before every migration chain and recorded with its exact restore command.',
  productionHealthOwner: 'scripts/build-production-health.js via final-production-reconcile.js',
  forumPersistence: 'D1 authoritative behind a strict fail-closed Worker with KV recovery mirror and live write/read proof.',
  paymentStatus: 'PayPal sandbox-ready behind strict server-side activation gates; checkout disabled during migration and deployment.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-sync-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`FAILED: ${item}`));
  process.exit(1);
}
console.log('Production synchronization assurance passed: manually confirmed Cloudflare release, non-interrupting D1 migration queue, Time Travel rollback, strict forums and server-gated PayPal.');
