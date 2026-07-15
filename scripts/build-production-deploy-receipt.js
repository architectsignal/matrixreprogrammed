const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const output = path.join(downloads, 'production-deploy-receipt.json');
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const readJson = file => {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
  catch { return null; }
};
const readText = file => {
  try { return fs.readFileSync(path.join(root, file), 'utf8'); }
  catch { return ''; }
};
const exists = file => fs.existsSync(path.join(root, file));
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };

async function fetchBoundary(route) {
  const response = await fetch(`${siteUrl}${route}?receipt_check=${Date.now()}`, {
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'MatrixProductionReceipt/4.0'
    }
  });
  const text = await response.text();
  return {
    status: response.status,
    origin: response.headers.get('x-matrix-origin') || null,
    data: parseJson(text)
  };
}

(async () => {
  const live = readJson('downloads/live-production-verification.json') || {};
  const rollback = readJson('downloads/d1-rollback-proof.json') || {};
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
  const rollbackPointCreated = rollback.ok === true
    && rollback.database === 'matrix-members'
    && rollback.method === 'Cloudflare D1 Time Travel bookmark'
    && typeof rollback.bookmark === 'string'
    && rollback.bookmark.trim().length >= 8
    && typeof rollback.restoreCommand === 'string'
    && rollback.restoreCommand.includes(rollback.bookmark);

  const bootstrapReady = bootstrap.ready === true
    && bootstrap.ok === true
    && bootstrap.data?.plansReady === true
    && Number(bootstrap.data?.planCount || 0) === 3;
  const bootstrapSafeDisabled = bootstrap.safeDisabled === true
    && bootstrap.ok === true
    && bootstrap.data?.plansReady === false
    && bootstrap.data?.databaseCheckoutEnabled === false
    && bootstrap.data?.liveChargingEnabled === false;
  const bootstrapSafe = bootstrapReady || bootstrapSafeDisabled;
  const rehearsalSafe = bootstrapReady
    ? rehearsal.ok === true
    : bootstrapSafeDisabled
      ? rehearsal.ok === true && rehearsal.skipped === true && rehearsal.safeDisabled === true
      : false;

  const [memberBoundary, emailBoundary] = await Promise.all([
    fetchBoundary('/api/member/me'),
    fetchBoundary('/api/email/admin/health')
  ]);
  const memberBoundaryPassed = memberBoundary.status === 401
    && memberBoundary.origin === 'cloudflare-worker-member-experience'
    && memberBoundary.data?.ok === false
    && memberBoundary.data?.authenticated === false;
  const emailBoundaryPassed = emailBoundary.status === 403
    && emailBoundary.origin === 'cloudflare-worker-email-lifecycle'
    && emailBoundary.data?.ok === false;

  const productionWorker = readText('src/worker-production.js');
  const reportDelivery = readText('src/worker-report-delivery.js');
  const accessGate = readText('src/worker-access-gate.js');
  const accessPolicy = readText('data/access-route-policy.json');
  const worker = readText('src/worker.js');
  const wrangler = readText('wrangler.toml');
  const timers = readJson('data/global-risk-clocks.json') || {};
  const timerPage = readText('timers.html');

  const reportDeliveryWired = productionWorker.includes('queueVerifiedSelfReport')
    && productionWorker.includes('queuePendingVerifiedSelfReports')
    && productionWorker.includes('processOutbox')
    && reportDelivery.includes('verified_self_intelligence_report')
    && reportDelivery.includes('report-is-not-verified-self')
    && reportDelivery.includes('current-membership-tier-required')
    && wrangler.includes('EMAIL_AUTOMATION_ENABLED = "true"')
    && wrangler.includes('"5 6 * * *"')
    && wrangler.includes('"15 7 * * 1"');

  const accessTiersWired = productionWorker.includes('protectedAssetTier')
    && productionWorker.includes('enforceProtectedAssetAccess')
    && accessGate.includes('member_effective_entitlements')
    && accessGate.includes('member_download_eligibility')
    && accessPolicy.includes('active-fail-closed')
    && accessPolicy.includes('h8mail_verified_self')
    && accessPolicy.includes('intelligence_6');

  const osintTiersWired = worker.includes("h8mail:{label:'Breach exposure review',access:'member',minimumTier:'intelligence_6',selfOnlyForMembers:true")
    && worker.includes("spiderfoot:{label:'Passive digital footprint scan',access:'member',minimumTier:'intelligence_6'")
    && worker.includes('This Intelligence tool may review only your own verified account email');

  const clocks = Array.isArray(timers.clocks) ? timers.clocks : [];
  const timersExplained = clocks.length > 0
    && clocks.every(clock => clock.scoreType === 'pressureIndex'
      && clock.scoreMeaning
      && clock.bandMeaning
      && clock.calculationBasis
      && clock.whatRaises
      && clock.whatLowers
      && clock.evidenceBoundary)
    && timerPage.includes('What this score means')
    && timerPage.includes('What would raise it')
    && timerPage.includes('What would lower it');

  const receipt = {
    schemaVersion: 4,
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
      rollbackPointCreated,
      rollbackMethod: rollback.method || null,
      rollbackBookmarkRecorded: Boolean(rollback.bookmark),
      restoreCommandRecorded: Boolean(rollback.restoreCommand),
      migrationLogCreated: exists('downloads/d1-migration.log'),
      requiredObjects: requiredObjects.length,
      verifiedObjects: requiredObjects.length - missingObjects.length,
      missingObjects,
      schemaVerified: missingObjects.length === 0
    },
    memberArea: {
      boundaryPassed: memberBoundaryPassed,
      status: memberBoundary.status,
      origin: memberBoundary.origin,
      authenticationFailClosed: memberBoundary.data?.authenticated === false,
      protectedAssetTiersWired: accessTiersWired,
      osintToolTiersWired: osintTiersWired
    },
    email: {
      boundaryPassed: emailBoundaryPassed,
      status: emailBoundary.status,
      origin: emailBoundary.origin,
      verifiedSelfReportDeliveryWired: reportDeliveryWired,
      dailyCron: '5 6 * * *',
      weeklyCron: '15 7 * * 1',
      providerSecretsRequired: ['BREVO_API_KEY', 'MEMBERS_FROM_EMAIL', 'EMAIL_WEBHOOK_SECRET']
    },
    timers: {
      count: clocks.length,
      explained: timersExplained,
      scoreType: 'pressureIndex',
      visualSynthesisRoute: '/timers.html'
    },
    paypal: {
      environment: 'sandbox',
      checkoutClosed,
      liveChargingEnabled: false,
      unauthenticatedBoundaryPassed: paypal.ok === true,
      bootstrapReady,
      bootstrapSafeDisabled,
      bootstrapSafe,
      bootstrapMode: bootstrapReady ? 'sandbox-ready' : bootstrapSafeDisabled ? 'sandbox-pending-disabled' : 'unsafe',
      bootstrapOrigin: bootstrap.origin || null,
      planCount: Number(bootstrap.data?.planCount || 0),
      prices: Array.isArray(bootstrap.data?.prices) ? bootstrap.data.prices.map(item => ({
        tier: item.tier,
        amount: item.amount,
        currency: item.currency,
        status: item.status
      })) : [],
      rehearsalBoundaryPassed: rehearsalSafe,
      rehearsalCheckoutClosed: rehearsal.checkout?.data?.checkoutEnabled === false || bootstrapSafeDisabled
    },
    forum: {
      d1WriteReadPassed: live.forumPersistence?.ok === true,
      origin: live.forumPersistence?.storage || null
    },
    safety: {
      secretsIncluded: false,
      providerPlanIdsIncluded: false,
      providerProductIdsIncluded: false,
      customerDataIncluded: false,
      reportsOnlyEmailVerifiedSelfResults: reportDelivery.includes('report-is-not-verified-self'),
      h8mailMemberScopeVerifiedSelfOnly: worker.includes('selfOnlyForMembers:true')
    },
    ok: live.ok === true
      && rollbackPointCreated
      && missingObjects.length === 0
      && checkoutClosed
      && paypal.ok === true
      && bootstrapSafe
      && rehearsalSafe
      && live.forumPersistence?.ok === true
      && memberBoundaryPassed
      && emailBoundaryPassed
      && reportDeliveryWired
      && accessTiersWired
      && osintTiersWired
      && timersExplained
  };

  fs.mkdirSync(downloads, { recursive: true });
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2));
  if (!receipt.ok) {
    console.error(JSON.stringify(receipt, null, 2));
    process.exit(1);
  }
  console.log(`Production deployment receipt created for ${String(receipt.deployedCommit).slice(0, 12)} with Time Travel rollback, member, email, PayPal, forum, timer and mission-tier boundaries verified.`);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
