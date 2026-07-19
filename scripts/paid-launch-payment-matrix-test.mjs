import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const checks = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`missing ${relativePath}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}
function readJson(relativePath) {
  const text = read(relativePath);
  try { return JSON.parse(text); }
  catch (error) { failures.push(`invalid JSON ${relativePath}: ${error.message}`); return {}; }
}
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}
function includesAll(text, values) { return values.every(value => text.includes(value)); }
function occurrence(text, pattern) { return (text.match(pattern) || []).length; }

const paypal = read('src/worker-paypal-subscriptions.js');
const rehearsal = read('src/worker-paypal-sandbox-rehearsal.js');
const migration = read('migrations/phase6_paypal_subscriptions.sql');
const foundation = read('migrations/0001_membership_foundation.sql');
const wrangler = read('wrangler.toml');
const membership = read('membership.html');
const template = read('scripts/templates/membership-auth/membership.template');
const membershipClient = read('paypal-membership.js');
const supportClient = read('paypal-voluntary-support.js');
const storePatch = read('scripts/patch-voluntary-support-store.js');
const launchPlan = read('docs/PAYPAL_EMAIL_LAUNCH_MASTER_PLAN.md');
const terms = read('terms-of-use.html');
const membershipTerms = read('membership-terms.html');
const commercial = readJson('data/commercial-readiness.json');

// Exact products and tier mapping.
for (const [tier, price, runtime] of [
  ['supporter', '3.00', 'supporter_3'],
  ['intelligence', '6.00', 'intelligence_6'],
  ['research_pro', '9.00', 'research_pro_9']
]) {
  check(`${tier} exact PayPal amount`, paypal.includes(`${tier}:{label:`) && paypal.includes(`price:'${price}'`) && paypal.includes(`runtimeTier:'${runtime}'`));
  check(`${tier} present in canonical membership source`, membership.includes(`id="join-${tier === 'intelligence' ? 'intelligence-member' : tier.replace('_','-')}"`) || membership.includes(`paypal-button-${tier}`));
  check(`${tier} present in membership template`, template.includes(`paypal-button-${tier}`));
}
check('membership source and template are identical', membership === template);
check('old paid prices absent from canonical membership', !/€(?:19|49)(?:\s|<|\/)/.test(membership));
check('old join placeholders absent from canonical membership', !/Join Placeholder|checkout disabled|activation gates|configured yet/i.test(membership));
check('free account is primary unavailable-checkout route', membership.includes('Create or access free account') && membershipClient.includes('Free Member registration is available'));

// Checkout intent, identity and plan verification.
check('checkout requires authenticated member', includesAll(paypal, ['async function checkoutIntent', 'requireAuth(request,env)']));
check('checkout requires enabled server state', paypal.includes("if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,error:'PayPal checkout is disabled until activation gates pass'},503)"));
check('checkout invalidates earlier unused intents', paypal.includes('UPDATE paypal_checkout_intents SET used_at=? WHERE member_id=? AND used_at IS NULL'));
check('confirm requires subscription and checkout intent', paypal.includes('Subscription ID and checkout intent are required'));
check('confirm rejects foreign, used and expired intent', includesAll(paypal, ['intent.member_id!==required.auth.member.id', 'intent.used_at', 'Date.parse(intent.expires_at)<=Date.now()']));
check('confirm binds provider id, plan and custom id', paypal.includes("clean(details.id,140)!==subscriptionId||clean(details.plan_id,140)!==intent.plan_id||clean(details.custom_id,180)!==intent.id"));
check('unknown provider plan cannot map to tier', paypal.includes("if(!tier)throw new Error('PayPal subscription does not match a configured plan')"));
check('subscription cannot move to another member', paypal.includes("if(row&&row.member_id!==memberId)throw new Error('PayPal subscription is already attached to another member')"));
check('approval alone does not promise access', paypal.includes("message:synced.paidAccess?'PayPal membership is active.':'PayPal approved the subscription; access activates only when PayPal reports ACTIVE.'"));

// Verified webhook and idempotency.
check('PayPal postback verification is required', includesAll(paypal, ['/v1/notifications/verify-webhook-signature', "verification_status||'FAILURE'", "if(!verification.ok)return json({ok:false,error:'PayPal webhook signature verification failed'},400)"]));
check('verified event recorded before processing', paypal.indexOf('paypal_webhook_verifications') < paypal.indexOf('processWebhookEvent(env,event,payloadHash)'));
check('duplicate provider event exits without reprocessing', includesAll(paypal, ['SELECT processing_status FROM payment_webhook_events WHERE provider_event_id=?', 'duplicate:true', 'processingStatus:duplicate.processing_status']));
check('provider event id is unique in foundation', foundation.includes('provider_event_id TEXT NOT NULL UNIQUE'));
check('payment event insert is idempotent', paypal.includes('INSERT OR IGNORE INTO paypal_payment_records'));
check('transition event insert is idempotent', paypal.includes('INSERT OR IGNORE INTO paypal_subscription_transitions'));
check('checkout intent has one-use marker', foundation.includes('used_at TEXT'));

// Renewal, grace, suspension, refund and reversal.
check('first failed renewal uses past-due grace', paypal.includes("const state=failures>=2?'suspended':'past_due'"));
check('second failed renewal removes entitlement', paypal.includes("function entitlementForState(state,failureCount=0,periodEnd=null){if(state==='active')return true;if(state==='past_due')return Number(failureCount||0)<2"));
check('completed payment restores active and resets failure count', paypal.includes("SET billing_state='active',entitlement_active=1,payment_failure_count=0,refund_hold=0,reversal_hold=0"));
check('refund creates hold and removes access', paypal.includes("const state=reversal?'reversal_hold':'refund_hold'") && paypal.includes('billing_state=?,entitlement_active=0'));
check('reversal creates hold and removes access', paypal.includes("reversal?'reversal_hold':'refund_hold'") && paypal.includes('reversal_hold=1,last_reversal_at=?'));
check('refund is recorded as payment type', paypal.includes("if(type.includes('REFUND'))paymentType='refund'"));
check('reversal is recorded as payment type', paypal.includes("else if(type.includes('REVERSED'))paymentType='reversal'"));

// Cancellation and period-end behavior.
check('cancellation calls PayPal provider', paypal.includes('/v1/billing/subscriptions/${encodeURIComponent(row.provider_subscription_id)}/cancel'));
check('future verified period becomes cancelled_period_end', paypal.includes("const state=periodEnd?'cancelled_period_end':'cancelled'"));
check('cancelled period retains access only before end', paypal.includes("if(state==='cancelled_period_end')return Boolean(periodEnd&&Date.parse(periodEnd)>Date.now())"));
check('cancelled period end stored for later expiry', includesAll(paypal, ['current_period_end=?', 'cancel_at_period_end=?']));

// Reconciliation.
check('admin reconciliation fetches every PayPal subscription', paypal.includes("SELECT * FROM subscriptions WHERE provider='paypal' ORDER BY updated_at DESC LIMIT 500"));
check('reconciliation reads provider state', paypal.includes('const provider=await subscriptionDetails(env,row.provider_subscription_id)'));
check('reconciliation uses fixed plan-to-tier sync', paypal.includes("await syncSubscription(env,provider,row.member_id,{type:'admin.reconcile'"));
check('reconciliation records checked changed and failed counts', includesAll(paypal, ['checked_count=?', 'changed_count=?', 'failed_count=?']));

// Timed rehearsal and checkout closure.
for (const marker of [
  'START MATRIX PAYPAL SANDBOX REHEARSAL',
  'COMPLETE MATRIX PAYPAL SANDBOX REHEARSAL',
  'ABORT MATRIX PAYPAL SANDBOX REHEARSAL',
  'activeEntitlementObserved',
  'verifiedWebhookObserved',
  'paymentCount',
  'cancellationObserved',
  'expireStaleRuns',
  'closeOrphanedCheckout',
  'liveChargingEnabled: false'
]) check(`rehearsal contains ${marker}`, rehearsal.includes(marker));
check('rehearsal maximum is 45 minutes', rehearsal.includes('Math.min(45'));
check('rehearsal completion closes checkout', rehearsal.includes('UPDATE paypal_runtime_settings SET checkout_enabled=0'));
check('only one active sandbox rehearsal', read('migrations/phase7_paypal_sandbox_rehearsal.sql').includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_paypal_sandbox_one_active'));
check('sandbox gate requires active timed run', includesAll(rehearsal, ['sandbox-checkout-requires-active-rehearsal', "status='active'", 'datetime(expires_at)>datetime']))

// Live and commercial fail-closed state.
check('PayPal environment remains sandbox', wrangler.includes('PAYPAL_ENVIRONMENT = "sandbox"'));
check('sandbox switch is available for timed rehearsal', wrangler.includes('PAYPAL_SANDBOX_ENABLED = "true"'));
check('production PayPal disabled', wrangler.includes('PAYPAL_PRODUCTION_ENABLED = "false"'));
check('donations disabled', wrangler.includes('PAYPAL_DONATIONS_ENABLED = "false"'));
check('commercial launch disabled', wrangler.includes('COMMERCIAL_LAUNCH_APPROVED = "false"'));
check('scheduled marketing disabled', wrangler.includes('EMAIL_AUTOMATION_ENABLED = "false"'));
check('transactional email enabled', wrangler.includes('EMAIL_TRANSACTIONAL_ENABLED = "true"'));
check('wrangler has a single vars table', occurrence(wrangler, /^\[vars\]$/gm) === 1, `found ${occurrence(wrangler, /^\[vars\]$/gm)}`);
check('commercial record blocks live charging', commercial.liveChargingApproved === false && commercial.status === 'blocked-before-live-charging');
check('commercial record requires every safety group', includesAll(JSON.stringify(commercial.checks), ['completeLegalOperatorIdentityConfirmed', 'vatTreatmentConfirmed', 'paypalBillingDescriptorConfirmed', 'consumerMediatorConfirmed', 'fullSandboxMatrixPassed', 'scheduledEmailProofPassed', 'humanDeviceCheckoutPassed']));

// Commercial pages and public copy.
for (const [file, text] of [['terms-of-use.html', terms], ['membership-terms.html', membershipTerms]]) {
  check(`${file} has operator contact`, text.includes('Nicholas John Matthews') && text.includes('njmgroupfrance@gmail.com'));
  check(`${file} has effective date`, text.includes('19 July 2026'));
}
for (const marker of ['Monthly until cancelled', 'Cancellation', 'withdrawal', 'Refunds', 'Failed renewal', 'Non-charitable', 'VAT', 'billing descriptor', 'consumer-mediation']) {
  check(`membership terms cover ${marker}`, membershipTerms.toLowerCase().includes(marker.toLowerCase()));
}
check('membership links commercial terms', membership.includes('membership-terms.html') && membership.includes('terms-of-use.html'));
check('store generator connects real newsletter form', includesAll(storePatch, ['data-newsletter-form', 'newsletter.js', 'Join Free Brief']));
check('store generator removes implementation placeholders', storePatch.includes('Email capture placeholder') && storePatch.includes('placeholdersRemoved'));
check('support client uses reader-facing prelaunch state', supportClient.includes('Paid support is opening soon') && !supportClient.includes('credentials and webhook are not configured'));
check('membership client uses reader-facing prelaunch state', membershipClient.includes('Paid memberships are opening soon') && !membershipClient.includes('activation switches'));

// Canonical email state must be consistent.
check('launch plan says scheduled marketing disabled', launchPlan.includes('scheduled marketing automation disabled') && launchPlan.includes('EMAIL_AUTOMATION_ENABLED` remains `false`'));
check('launch plan keeps delivery proof pending', includesAll(launchPlan, ['Review the first three controlled daily deliveries', 'Review the first controlled weekly delivery', 'Confirm Brevo delivery webhook processing']));
check('launch plan forbids buyer secrets in repository', launchPlan.includes('Sandbox buyer passwords must never be committed'));

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  name: 'Paid launch payment and commercial matrix',
  checks,
  failures,
  boundaries: {
    realSandboxBuyerPurchasePerformedByThisTest: false,
    liveChargingEnabled: false,
    transactionalEmailEnabled: true,
    scheduledMarketingEnabled: false,
    note: 'This blocking source and behavior contract test supplements, but does not replace, the timed PayPal sandbox buyer rehearsal and human device checkout.'
  }
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'paid-launch-payment-matrix-test.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('\nPAID LAUNCH PAYMENT MATRIX FAILED\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PAID LAUNCH PAYMENT MATRIX PASSED (${checks.length} checks; live charging remains disabled)`);
