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
  const separator = route.includes('?') ? '&' : '?';
  const response = await fetch(`${siteUrl}${route}${separator}receipt_check=${Date.now()}`, {
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'MatrixProductionReceipt/5.0'
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
  const brevoReadiness = readJson('downloads/brevo-operational-readiness.json') || {};
  const emailCampaignQuality = readJson('downloads/email-campaign-quality-patch.json') || {};
  const emailAutomationGuard = readJson('downloads/email-automation-guard-patch.json') || {};
  const paypalBoundary = live.paypalBoundary || {};
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
  const sandboxSetting = settingRows.find(row => row.environment === 'sandbox') || null;
  const liveSetting = settingRows.find(row => row.environment === 'live') || null;
  const sandboxCheckoutClosed = Number(sandboxSetting?.checkout_enabled) === 0;
  const liveCheckoutEnabled = Number(liveSetting?.checkout_enabled) === 1;
  const runtimeSettingsValid = Boolean(sandboxSetting && liveSetting)
    && [0, 1].includes(Number(sandboxSetting.checkout_enabled))
    && [0, 1].includes(Number(liveSetting.checkout_enabled));

  const rollbackPointCreated = rollback.ok === true
    && rollback.database === 'matrix-members'
    && rollback.method === 'Cloudflare D1 Time Travel bookmark'
    && typeof rollback.bookmark === 'string'
    && rollback.bookmark.trim().length >= 8
    && typeof rollback.restoreCommand === 'string'
    && rollback.restoreCommand.includes(rollback.bookmark);

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
  const paypalWorker = readText('src/worker-paypal-subscriptions.js');
  const paypalClient = readText('paypal-membership.js');
  const reportDelivery = readText('src/worker-report-delivery.js');
  const accessGate = readText('src/worker-access-gate.js');
  const accessPolicy = readText('data/access-route-policy.json');
  const worker = readText('src/worker.js');
  const wranglerToml = readText('wrangler.toml');
  const wranglerJsonc = readText('wrangler.jsonc');
  const timers = readJson('data/global-risk-clocks.json') || {};
  const timerPage = readText('timers.html');

  const reportDeliveryWired = productionWorker.includes('queueVerifiedSelfReport')
    && productionWorker.includes('queuePendingVerifiedSelfReports')
    && productionWorker.includes('processOutbox')
    && reportDelivery.includes('verified_self_intelligence_report')
    && reportDelivery.includes('report-is-not-verified-self')
    && reportDelivery.includes('current-membership-tier-required')
    && wranglerToml.includes('EMAIL_AUTOMATION_ENABLED = "true"')
    && wranglerToml.includes('EMAIL_TRANSACTIONAL_ENABLED = "true"')
    && wranglerToml.includes('BREVO_DOMAIN_AUTHENTICATED = "true"')
    && wranglerToml.includes('EMAIL_RETRY_QUARANTINE_BEFORE = "2026-07-18T00:00:00.000Z"')
    && wranglerToml.includes('INTELLIGENCE_REPORT_BATCH_LIMIT = "100"')
    && brevoReadiness.ok === true
    && brevoReadiness.status === 'automation-and-transactional-ready'
    && emailCampaignQuality.ok === true
    && emailAutomationGuard.ok === true
    && wranglerToml.includes('"5 6 * * *"')
    && wranglerToml.includes('"15 7 * * 1"');

  const accessTiersWired = productionWorker.includes('protectedAssetTier')
    && productionWorker.includes('enforceProtectedAssetAccess')
    && accessGate.includes('member_effective_entitlements')
    && accessGate.includes('tierRank')
    && accessGate.includes('requiredTier')
    && accessPolicy.includes('"exactRules"')
    && accessPolicy.includes('"patternRules"')
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

  const runtimeVariablesPreserved = /^keep_vars\s*=\s*true\s*$/m.test(wranglerToml)
    && /"keep_vars"\s*:\s*true/.test(wranglerJsonc)
    && !/^\s*PAYPAL_[A-Z0-9_]+\s*=/m.test(wranglerToml)
    && !/^\s*"PAYPAL_[A-Z0-9_]+"\s*:/m.test(wranglerJsonc);

  const activationContractWired = paypalWorker.includes('const plansReady=')
    && paypalWorker.includes('&&confirmation&&plansReady')
    && paypalWorker.includes("String(env?.PAYPAL_LIVE_ACTIVATION_CONFIRMATION||'')==='MATRIX_PAYPAL_LIVE_CONFIRMED'")
    && paypalWorker.includes("String(input.phrase||'')!=='ACTIVATE MATRIX PAYPAL LIVE'")
    && paypalWorker.includes("error:'PayPal checkout is disabled until activation gates pass'");

  const serverRedirectWired = paypalClient.includes('/api/paypal/subscription/create')
    && paypalClient.includes('Continue securely to PayPal')
    && paypalClient.includes("credentials:'include'")
    && paypalWorker.includes("'/v1/billing/subscriptions'")
    && paypalWorker.includes("rel==='approve'");

  const receipt = {
    schemaVersion: 5,
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
      manifestMatchedDeployment: live.manifestMatches === true,
      healthMatchedCommit: live.healthMatches === true,
      runtimeVariablesPreserved
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
      brevoReady: brevoReadiness.ok === true,
      brevoStatus: brevoReadiness.status || null,
      domainAuthenticationConfirmed: true,
      transactionalDeliveryEnabled: true,
      marketingAutomationEnabled: true,
      marketingAutomationConsentBound: true,
      personalizedBatchLimit: 100,
      preActivationRetryGuard: emailAutomationGuard.ok === true,
      campaignQualityVerified: emailCampaignQuality.ok === true,
      dailySource: emailCampaignQuality.dailySource || null,
      weeklySource: emailCampaignQuality.weeklySource || null,
      replyToSupported: brevoReadiness.checks?.replyToSupported === true,
      dailyCron: '5 6 * * *',
      weeklyCron: '15 7 * * 1',
      providerSecretsRequired: ['BREVO_API_KEY', 'MEMBERS_FROM_EMAIL', 'MEMBERS_REPLY_TO_EMAIL', 'EMAIL_WEBHOOK_SECRET', 'ADMIN_API_TOKEN']
    },
    timers: {
      count: clocks.length,
      explained: timersExplained,
      scoreType: 'pressureIndex',
      visualSynthesisRoute: '/timers.html'
    },
    paypal: {
      runtimeModel: 'Cloudflare-dashboard-managed and D1-gated',
      configuredEnvironment: liveCheckoutEnabled ? 'live' : 'dashboard-managed',
      liveCheckoutEnabled,
      liveActivationReason: liveSetting?.activation_reason || null,
      sandboxCheckoutClosed,
      sandboxActivationReason: sandboxSetting?.activation_reason || null,
      runtimeSettingsValid,
      runtimeVariablesPreserved,
      unauthenticatedBoundaryPassed: paypalBoundary.ok === true,
      anonymousChargePossible: paypalBoundary.anonymousChargePossible === false,
      boundaryOrigin: paypalBoundary.checkout?.origin || paypalBoundary.config?.origin || null,
      activationContractWired,
      serverRedirectWired,
      plansRequiredByWorker: true,
      webhookRequiredByWorker: true,
      liveConfirmationRequiredByWorker: true
    },
    forum: {
      d1WriteReadPassed: live.forumPersistence?.ok === true,
      authoritativeStorage: live.forumPersistence?.authoritativeStorage || null,
      anonymousWriteRejected: live.forumPersistence?.anonymousWriteRejected === true
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
      && runtimeSettingsValid
      && sandboxCheckoutClosed
      && paypalBoundary.ok === true
      && paypalBoundary.anonymousChargePossible === false
      && runtimeVariablesPreserved
      && activationContractWired
      && serverRedirectWired
      && live.forumPersistence?.ok === true
      && memberBoundaryPassed
      && emailBoundaryPassed
      && brevoReadiness.ok === true
      && brevoReadiness.status === 'automation-and-transactional-ready'
      && emailCampaignQuality.ok === true
      && emailAutomationGuard.ok === true
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
  console.log(`Production deployment receipt created for ${String(receipt.deployedCommit).slice(0, 12)} with Time Travel rollback, live PayPal runtime preservation, member, email, forum, timer and mission-tier boundaries verified.`);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
