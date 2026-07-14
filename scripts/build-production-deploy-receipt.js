const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const output = path.join(downloads, 'production-deploy-receipt.json');
const readJson = file => {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
  catch { return null; }
};
const exists = file => fs.existsSync(path.join(root, file));

const live = readJson('downloads/live-production-verification.json') || {};
const schema = readJson('downloads/d1-schema-verification.json') || [];
const settings = readJson('downloads/paypal-runtime-settings.json') || [];
const bootstrap = live.bootstrapBoundary || {};
const rehearsal = live.rehearsalBoundary || {};
const paypal = live.paypalBoundary || {};
const rows = payload => Array.isArray(payload)
  ? payload.flatMap(item => item?.results || item?.result?.results || [])
  : [];
const schemaRows = rows(schema);
const settingRows = rows(settings);

const requiredObjects = [
  'members', 'member_sessions', 'subscriptions', 'audit_log', 'email_campaigns',
  'member_access_grants', 'member_saved_items', 'member_entity_follows', 'member_watch_items',
  'member_archive_entries', 'member_download_catalog', 'paypal_runtime_settings', 'paypal_products',
  'paypal_plans', 'paypal_subscription_transitions', 'paypal_payment_records',
  'paypal_sandbox_rehearsal_runs', 'paypal_sandbox_rehearsal_evidence',
  'paypal_sandbox_bootstrap_status', 'paypal_sandbox_bootstrap_health',
  'member_effective_entitlements', 'member_download_eligibility'
];
const names = new Set(schemaRows.map(row => row.name));
const missingObjects = requiredObjects.filter(name => !names.has(name));
const checkoutClosed = settingRows.length >= 2 && settingRows.every(row => Number(row.checkout_enabled) === 0);

const receipt = {
  schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY || 'architectsignal/matrixreprogrammed',
  workflow: process.env.GITHUB_WORKFLOW || 'Matrix Reprogrammed Production Deploy',
  runId: process.env.GITHUB_RUN_ID || null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  deployedCommit: process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || live.expectedSha || null,
  deployedAt: new Date().toISOString(),
  cloudflare: {
    authoritative: true,
    worker: 'src/worker-production.js',
    liveVerificationPassed: live.ok === true,
    manifestMatchedMain: live.manifestMatches === true,
    healthMatchedCommit: live.healthMatches === true
  },
  d1: {
    database: 'matrix-members',
    rollbackSnapshotCreated: exists('downloads/d1-backup-proof.txt'),
    migrationLogCreated: exists('downloads/d1-migration.log'),
    requiredObjects: requiredObjects.length,
    verifiedObjects: requiredObjects.length - missingObjects.length,
    missingObjects,
    schemaVerified: missingObjects.length === 0
  },
  paypal: {
    environment: 'sandbox',
    checkoutClosed,
    liveChargingEnabled: false,
    unauthenticatedBoundaryPassed: paypal.ok === true,
    bootstrapReady: bootstrap.ok === true && bootstrap.data?.plansReady === true,
    bootstrapOrigin: bootstrap.origin || null,
    planCount: Number(bootstrap.data?.planCount || 0),
    prices: Array.isArray(bootstrap.data?.prices) ? bootstrap.data.prices.map(item => ({
      tier: item.tier,
      amount: item.amount,
      currency: item.currency,
      status: item.status
    })) : [],
    rehearsalBoundaryPassed: rehearsal.ok === true,
    rehearsalCheckoutClosed: rehearsal.checkout?.data?.checkoutEnabled === false
  },
  forum: {
    d1WriteReadPassed: live.forumPersistence?.ok === true,
    origin: live.forumPersistence?.storage || null
  },
  safety: {
    secretsIncluded: false,
    providerPlanIdsIncluded: false,
    providerProductIdsIncluded: false,
    customerDataIncluded: false
  },
  ok: live.ok === true
    && missingObjects.length === 0
    && checkoutClosed
    && paypal.ok === true
    && bootstrap.ok === true
    && bootstrap.data?.plansReady === true
    && rehearsal.ok === true
    && live.forumPersistence?.ok === true
};

fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(output, JSON.stringify(receipt, null, 2));
if (!receipt.ok) {
  console.error(JSON.stringify(receipt, null, 2));
  process.exit(1);
}
console.log(`Production deployment receipt created for ${String(receipt.deployedCommit).slice(0, 12)} without secrets or customer data.`);
