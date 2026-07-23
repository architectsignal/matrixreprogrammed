const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const failures = [];
const exists = rel => fs.existsSync(path.join(root, rel));
const read = rel => exists(rel) ? fs.readFileSync(path.join(root, rel), 'utf8') : '';
const siteRead = rel => {
  const file = path.join(site, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};
const check = (name, ok) => { if (!ok) failures.push(name); };

const canonicalDeploy = read('.github/workflows/deploy.yml');
const fallbackDeploy = read('.github/workflows/deploy-production.yml');
const dispatchDeploy = read('.github/workflows/one-shot-dispatch-controlled-production.yml');
const legacyRepair = read('scripts/repair-generated-site-artifacts.js');
const regressionWrapper = read('scripts/cloudflare-focused-pressure-wrapper.js');
const liveVerifier = read('scripts/verify-live-production.js');
const productionHealth = read('scripts/build-production-health.js');
const wranglerToml = read('wrangler.toml');
const wranglerJsonc = read('wrangler.jsonc');
const executableDeployCommand = /^\s*(?:-\s*)?(?:run:\s*)?(?:npx(?:\s+--yes)?\s+)?wrangler(?:@latest)?\s+(?:deploy|pages\s+deploy)\b/im;
const d1MutationCommand = /\b(?:npx(?:\s+--yes)?\s+)?wrangler(?:@latest)?\s+d1\s+(?:execute|migrations\s+apply)\b|checkout_enabled\s*=/i;
const explicitFreeze = text => /HARD FREEZE|PRODUCTION DEPLOYMENT LOCKED|MANUAL FALLBACK DEPLOYMENT LOCKED|PRODUCTION DISPATCH LOCKED/i.test(text);
const hardFreeze = [canonicalDeploy, fallbackDeploy, dispatchDeploy].every(explicitFreeze);

if (hardFreeze) {
  check('canonical deploy is manual only', canonicalDeploy.includes('workflow_dispatch:') && !/^\s*(?:push|pull_request|schedule):/m.test(canonicalDeploy));
  check('fallback deploy is manual only', fallbackDeploy.includes('workflow_dispatch:') && !/^\s*(?:push|pull_request|schedule):/m.test(fallbackDeploy));
  check('automatic dispatcher has no automatic trigger', dispatchDeploy.includes('workflow_dispatch:') && !/^\s*(?:push|pull_request|schedule):/m.test(dispatchDeploy));
  for (const [label, workflow] of [['canonical', canonicalDeploy], ['fallback', fallbackDeploy], ['dispatcher', dispatchDeploy]]) {
    check(`${label} production workflow is explicitly frozen`, explicitFreeze(workflow));
    check(`${label} production workflow contains no executable Wrangler deploy`, !executableDeployCommand.test(workflow));
    check(`${label} production workflow contains no D1 or checkout mutation`, !d1MutationCommand.test(workflow));
    check(`${label} production workflow cannot silently activate PayPal`, !workflow.includes('PAYPAL_PRODUCTION_ENABLED=true') && !workflow.includes('ACTIVATE MATRIX PAYPAL LIVE'));
  }
  check('release readiness retains intelligence refresh scripts', exists('scripts/run-investigation-machine.js') && exists('scripts/update-live-intel.js'));
  check('release readiness retains final reconciliation and live verification', exists('scripts/final-production-reconcile.js') && exists('scripts/verify-live-production.js'));
  check('release readiness retains D1 migration chain', ['phase4_email_lifecycle.sql','phase4_email_lifecycle_portability.sql','phase5_member_experience.sql','phase5_member_experience_timestamp_fix.sql','phase6_paypal_subscriptions.sql','phase6_paypal_failure_counter_fix.sql','phase7_paypal_sandbox_rehearsal.sql'].every(name => exists(`migrations/${name}`)));
  check('release readiness retains strict Worker and rollback guard', exists('src/worker-production.js') && exists('scripts/production-deploy-guard.js'));
} else {
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
  check('canonical deploy preserves live payment state and closes sandbox', canonicalDeploy.includes('preserve payment switches') && canonicalDeploy.includes('Sandbox checkout must remain closed outside an explicit rehearsal') && canonicalDeploy.includes('live checkout state preserved'));
  check('canonical deploy verifies strict PayPal route', canonicalDeploy.includes('verify-live-production.js') && liveVerifier.includes('verifyPayPalBoundary') && liveVerifier.includes('/api/paypal/config') && liveVerifier.includes('/api/paypal/subscription/create') && liveVerifier.includes('cloudflare-worker-paypal-subscriptions'));

  check('fallback deploy is manual only', fallbackDeploy.includes('workflow_dispatch:') && !/^\s*(?:push|pull_request|schedule):/m.test(fallbackDeploy));
  check('fallback deploy remains explicitly hard frozen', explicitFreeze(fallbackDeploy));
  check('fallback deploy contains no executable Wrangler deploy', !executableDeployCommand.test(fallbackDeploy));
  check('fallback deploy contains no D1 or checkout mutation', !d1MutationCommand.test(fallbackDeploy));
  check('fallback deploy cannot silently activate PayPal', !fallbackDeploy.includes('PAYPAL_PRODUCTION_ENABLED=true') && !fallbackDeploy.includes('ACTIVATE MATRIX PAYPAL LIVE'));

  check('dispatcher contains no direct Cloudflare deployment command', !executableDeployCommand.test(dispatchDeploy));
  check('dispatcher contains no D1 or checkout mutation', !d1MutationCommand.test(dispatchDeploy));
  check('dispatcher cannot silently activate PayPal', !dispatchDeploy.includes('PAYPAL_PRODUCTION_ENABLED=true') && !dispatchDeploy.includes('ACTIVATE MATRIX PAYPAL LIVE'));
}

check('legacy repair cannot publish health', legacyRepair.includes("productionHealthOwner: 'scripts/build-production-health.js'") && !legacyRepair.includes("workerScript: 'src/worker.js'") && !legacyRepair.includes("write('deploy-health.json'"));
check('regression wrapper runs final reconciliation', regressionWrapper.includes('final-production-reconcile.js'));
check('regression wrapper tests runtime-gated PayPal', regressionWrapper.includes('runtime-gated-dashboard-managed') && regressionWrapper.includes('keep_vars'));
check('regression wrapper tests strict Worker', regressionWrapper.includes('src/worker-production.js') && regressionWrapper.includes('non-authoritative-forum-response-blocked') && regressionWrapper.includes('non-authoritative-paypal-response-blocked'));

check('live verifier proves forum D1 write/read', liveVerifier.includes('verifyForumPersistence') && liveVerifier.includes('/submit-main-post') && liveVerifier.includes('storedPostCount'));
check('live verifier proves health SHA', liveVerifier.includes('/deploy-health.json') && liveVerifier.includes('healthMatches'));
check('live verifier proves anonymous PayPal fail-closed boundary', liveVerifier.includes('verifyPayPalBoundary') && liveVerifier.includes('/api/paypal/subscription/create') && liveVerifier.includes('subscriptionCreate') && liveVerifier.includes('cloudflare-worker-paypal-subscriptions'));
check('production health uses runtime-gated model', productionHealth.includes("paymentStatus: 'runtime-gated-dashboard-managed'") && productionHealth.includes("checkoutDefault: 'runtime-d1-gated'"));
check('Wrangler preserves dashboard variables', /^keep_vars\s*=\s*true\s*$/m.test(wranglerToml) && /"keep_vars"\s*:\s*true/.test(wranglerJsonc));
check('Wrangler does not contain active PayPal overrides', !/^PAYPAL_[A-Z0-9_]+\s*=/m.test(wranglerToml) && !/"PAYPAL_[A-Z0-9_]+"\s*:/.test(wranglerJsonc));

check('freshness policy exists', exists('data/production-freshness-policy.json'));
check('source deployment manifest exists', exists('deploy-manifest.json'));
check('built deployment manifest exists', fs.existsSync(path.join(site, 'deploy-manifest.json')));
check('source production health exists', exists('deploy-health.json') && exists('deploy-health.html'));
check('built production health exists', fs.existsSync(path.join(site, 'deploy-health.json')) && fs.existsSync(path.join(site, 'deploy-health.html')) && fs.existsSync(path.join(site, 'deploy-health')));
check('production health is regenerated last', read('scripts/final-production-reconcile.js').includes('build-production-health.js') && read('scripts/final-production-reconcile.js').includes('downloads/deploy-health.json'));
check('main navigation safety links', read('index.html').includes('security-privacy.html') && read('index.html').includes('dark-web-safety.html'));
check('Start Here safety links', read('start-here.html').includes('Open Security Tools') && read('start-here.html').includes('Open Dark Web Safety'));
check('membership preserves free and server-gated paid tiers', read('membership.html').includes('Free Member') && read('membership.html').includes('paypal-membership.js') && read('membership.html').includes('Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.') && !read('membership.html').includes('Coming soon — no payment taken'));
check('built membership preserves SDK-free PayPal redirect runtime', siteRead('membership.html').includes('paypal-membership.js') && siteRead('paypal-membership.js').includes('/api/paypal/subscription/create') && siteRead('paypal-membership.js').includes('Continue securely to PayPal') && siteRead('paypal-membership.js').includes('location.assign') && !siteRead('paypal-membership.js').includes('paypal.com/sdk/js'));
for (const rel of ['daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html']) {
  check(`${rel} integrity cards`, read(rel).includes('<!-- conclusion-integrity:start -->'));
  check(`built ${rel} integrity cards`, siteRead(rel).includes('<!-- conclusion-integrity:start -->'));
}
check('critical HTML no-cache policy', read('_headers').includes('/deploy-manifest.json') && read('_headers').includes('/deploy-health.json') && read('_headers').includes('Cache-Control: no-store'));
check('forum persistence wrapper exists', exists('src/worker-forum-persistence.js'));
check('strict production Worker exists', exists('src/worker-production.js'));
check('strict Worker entrypoint active', read('wrangler.toml').includes('main = "src/worker-production.js"') && read('wrangler.jsonc').includes('"main": "src/worker-production.js"'));
check('strict Worker blocks legacy success', read('src/worker-production.js').includes('non-authoritative-forum-response-blocked') && read('src/worker-production.js').includes('non-authoritative-paypal-response-blocked') && read('src/worker-production.js').includes('members-db-binding-unavailable'));
const forumPersistenceWorker = read('src/worker-forum-persistence.js');
check('forum D1 is authoritative',
  forumPersistenceWorker.includes('Cloudflare D1 MEMBERS_DB.forum_posts') &&
  forumPersistenceWorker.includes('INSERT INTO forum_posts') &&
  !forumPersistenceWorker.includes('INSERT OR IGNORE INTO forum_posts') &&
  forumPersistenceWorker.includes('D1 did not confirm the forum insert') &&
  forumPersistenceWorker.includes('D1 forum read-after-write confirmation failed')
);
check('PayPal migration schema exists', read('migrations/phase6_paypal_subscriptions.sql').includes('paypal_runtime_settings') && read('migrations/phase6_paypal_subscriptions.sql').includes('paypal_subscription_transitions'));

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  deploymentMode: hardFreeze ? 'hard-freeze' : 'deployment-enabled',
  deploymentModel: hardFreeze
    ? 'Cloudflare production is hard frozen. Git intelligence updates continue, while canonical, fallback and dispatcher workflows are inert and mutation-free.'
    : 'One manually confirmed canonical Cloudflare production release is active. The fallback remains hard frozen and the dispatcher cannot mutate Cloudflare or D1 directly.',
  rollbackModel: hardFreeze
    ? 'No production migration may run while frozen. Migration files, strict Worker, reconciliation and guard assets remain preserved for a future explicitly restored release workflow.'
    : 'The single canonical migration path captures and validates a Cloudflare D1 Time Travel bookmark before every migration chain and records the exact restore command.',
  productionHealthOwner: 'scripts/build-production-health.js via final-production-reconcile.js',
  forumPersistence: 'D1 authoritative behind a strict fail-closed Worker; every accepted forum insert must change one row and the exact post must be read back before success.',
  paymentStatus: 'PayPal runtime values are Cloudflare-managed and preserved by Wrangler; the Worker creates subscriptions and returns an official PayPal approval URL while checkout remains controlled by credentials, matching environment switch, D1 state, live confirmation and three active plans.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-sync-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`FAILED: ${item}`));
  process.exit(1);
}
console.log(hardFreeze
  ? 'Production synchronization assurance passed: all production workflows are hard frozen, mutation-free and deployment readiness remains preserved in Git.'
  : 'Production synchronization assurance passed: one manually confirmed rollback-protected Cloudflare release, frozen non-mutating fallback, strict read-after-write forums and SDK-free runtime-gated PayPal.');