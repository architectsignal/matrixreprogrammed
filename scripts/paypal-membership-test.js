const fs = require('fs');
const path = require('path');
const cryptoNode = require('crypto');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

class MockStatement {
  constructor(db, sql) { this.db = db; this.sql = String(sql); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const sql = this.sql;
    if (sql.includes('UPDATE member_sessions SET last_seen_at=')) {
      const [value, id] = this.args; const row = this.db.sessionsById.get(id); if (row) row.last_seen_at = value; return { success: true };
    }
    if (sql.includes('UPDATE paypal_checkout_intents SET used_at=? WHERE member_id=?')) {
      const [usedAt, memberId, tier] = this.args;
      for (const row of this.db.intents.values()) if (row.member_id === memberId && row.tier === tier && !row.used_at) row.used_at = usedAt;
      return { success: true };
    }
    if (sql.includes('INSERT INTO paypal_checkout_intents')) {
      const [id, memberId, tier, planId, expiresAt, createdAt] = this.args;
      this.db.intents.set(id, { id, member_id: memberId, tier, plan_id: planId, expires_at: expiresAt, used_at: null, created_at: createdAt });
      return { success: true };
    }
    if (sql.includes('UPDATE paypal_checkout_intents SET used_at=? WHERE id=?')) {
      const [usedAt, id] = this.args; const row = this.db.intents.get(id); if (row) row.used_at = usedAt; return { success: true };
    }
    if (sql.includes('INSERT INTO subscriptions')) {
      const [id, memberId, provider, customerId, subscriptionId, planId, tier, status, lastPaymentAt, nextBillingAt, currentPeriodEnd, cancelAtPeriodEnd, suspendedAt, cancelledAt, createdAt, updatedAt] = this.args;
      const row = { id, member_id: memberId, provider, provider_customer_id: customerId, provider_subscription_id: subscriptionId, provider_plan_id: planId, tier, status, last_payment_at: lastPaymentAt, next_billing_at: nextBillingAt, current_period_end: currentPeriodEnd, cancel_at_period_end: cancelAtPeriodEnd, suspended_at: suspendedAt, cancelled_at: cancelledAt, created_at: createdAt, updated_at: updatedAt };
      this.db.subscriptions.set(subscriptionId, row); return { success: true };
    }
    if (sql.includes('UPDATE subscriptions SET provider_customer_id=')) {
      const [customerId, planId, tier, status, lastPaymentAt, nextBillingAt, currentPeriodEnd, cancelAtPeriodEnd, suspendedAt, cancelledAt, updatedAt, id] = this.args;
      const row = [...this.db.subscriptions.values()].find(item => item.id === id);
      if (row) Object.assign(row, { provider_customer_id: customerId, provider_plan_id: planId, tier, status, last_payment_at: lastPaymentAt || row.last_payment_at, next_billing_at: nextBillingAt, current_period_end: currentPeriodEnd, cancel_at_period_end: cancelAtPeriodEnd, suspended_at: suspendedAt || row.suspended_at, cancelled_at: cancelledAt || row.cancelled_at, updated_at: updatedAt });
      return { success: true };
    }
    if (sql.includes("UPDATE subscriptions SET status='CANCELLED'")) {
      const [cancelledAt, updatedAt, id] = this.args; const row = [...this.db.subscriptions.values()].find(item => item.id === id); if (row) Object.assign(row, { status: 'CANCELLED', cancel_at_period_end: 1, cancelled_at: cancelledAt, updated_at: updatedAt }); return { success: true };
    }
    if (sql.includes('UPDATE subscriptions SET last_payment_at=')) {
      const [lastPaymentAt, updatedAt, subscriptionId] = this.args; const row = this.db.subscriptions.get(subscriptionId); if (row) Object.assign(row, { last_payment_at: lastPaymentAt, updated_at: updatedAt }); return { success: true };
    }
    if (sql.includes('UPDATE members SET tier=')) {
      const [tier, updatedAt, memberId] = this.args; const row = this.db.members.get(memberId); if (row) { row.tier = tier; row.updated_at = updatedAt; } return { success: true };
    }
    if (sql.includes('INSERT INTO audit_log')) { this.db.audit.push(this.args); return { success: true }; }
    if (sql.includes('INSERT INTO payment_webhook_events')) {
      const [id, provider, providerEventId, eventType, payloadJson, receivedAt, processingStatus] = this.args;
      this.db.events.set(providerEventId, { id, provider, provider_event_id: providerEventId, event_type: eventType, payload_json: payloadJson, received_at: receivedAt, processed_at: null, processing_status: processingStatus, error_message: null }); return { success: true };
    }
    if (sql.includes('UPDATE payment_webhook_events SET processed_at=?,processing_status=?,error_message=')) {
      const [processedAt, processingStatus, errorMessage, eventId] = this.args; const row = this.db.events.get(eventId); if (row) Object.assign(row, { processed_at: processedAt, processing_status: processingStatus, error_message: errorMessage }); return { success: true };
    }
    if (sql.includes('UPDATE payment_webhook_events SET processed_at=?,processing_status=?')) {
      const [processedAt, processingStatus, eventId] = this.args; const row = this.db.events.get(eventId); if (row) Object.assign(row, { processed_at: processedAt, processing_status: processingStatus }); return { success: true };
    }
    throw new Error('Unhandled PayPal mock run SQL: ' + sql.slice(0, 220));
  }
  async first() {
    const sql = this.sql;
    if (sql.includes('FROM member_sessions WHERE session_hash=')) return this.db.sessionsByHash.get(String(this.args[0])) || null;
    if (sql.includes('FROM members WHERE id=')) return this.db.members.get(String(this.args[0])) || null;
    if (sql.includes('FROM paypal_checkout_intents WHERE id=')) return this.db.intents.get(String(this.args[0])) || null;
    if (sql.includes('FROM subscriptions WHERE provider_subscription_id=')) return this.db.subscriptions.get(String(this.args[0])) || null;
    if (sql.includes("FROM subscriptions WHERE member_id=? AND provider='paypal' AND status='ACTIVE'")) {
      const memberId = String(this.args[0]); return [...this.db.subscriptions.values()].filter(row => row.member_id === memberId && row.status === 'ACTIVE').sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null;
    }
    if (sql.includes("FROM subscriptions WHERE member_id=? AND provider='paypal' ORDER BY")) {
      const memberId = String(this.args[0]); return [...this.db.subscriptions.values()].filter(row => row.member_id === memberId).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null;
    }
    if (sql.includes('FROM payment_webhook_events WHERE provider_event_id=')) return this.db.events.get(String(this.args[0])) || null;
    if (sql.includes('SELECT member_id FROM paypal_checkout_intents WHERE id=')) { const row = this.db.intents.get(String(this.args[0])); return row ? { member_id: row.member_id } : null; }
    if (sql.includes('COUNT(*) AS count FROM subscriptions')) return { count: this.db.subscriptions.size };
    if (sql.includes('COUNT(*) AS count FROM paypal_checkout_intents')) return { count: this.db.intents.size };
    if (sql.includes('COUNT(*) AS count FROM payment_webhook_events')) return { count: this.db.events.size };
    return null;
  }
}

class MockD1 {
  constructor() {
    this.members = new Map(); this.sessionsByHash = new Map(); this.sessionsById = new Map();
    this.intents = new Map(); this.subscriptions = new Map(); this.events = new Map(); this.audit = [];
  }
  prepare(sql) { return new MockStatement(this, sql); }
}

function jsonRequest(url, body, headers = {}) { return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); }
async function readJson(response) { const text = await response.text(); try { return JSON.parse(text); } catch { return { parseError: text.slice(0, 300) }; } }
function hash(value) { return cryptoNode.createHash('sha256').update(String(value)).digest('hex'); }

async function main() {
  const patch = spawnSync(process.execPath, ['scripts/patch-worker-newsletter-system.js'], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  if (patch.stdout) process.stdout.write(patch.stdout);
  if (patch.stderr) process.stderr.write(patch.stderr);
  if (patch.status !== 0) throw new Error('PayPal membership patch chain failed');

  const source = fs.readFileSync(path.join(root, 'src', 'worker.js'), 'utf8');
  const tempFile = path.join(reportDir, '.paypal-worker-' + Date.now() + '.mjs');
  fs.writeFileSync(tempFile, source);
  let module;
  try { module = await import(pathToFileURL(tempFile).href + '?v=' + Date.now()); }
  finally { try { fs.unlinkSync(tempFile); } catch {} }
  const worker = module && module.default;
  if (!worker || typeof worker.fetch !== 'function') throw new Error('Worker fetch handler unavailable');

  const d1 = new MockD1();
  const rawSession = 'paypal-test-session-token';
  const member = { id: 'member-paypal-1', email: 'member@example.com', display_name: 'PayPal Member', status: 'active', marketing_status: 'subscribed', tier: 'free', email_verified_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_login_at: new Date().toISOString() };
  d1.members.set(member.id, member);
  const session = { id: 'session-paypal-1', member_id: member.id, session_hash: hash(rawSession), expires_at: new Date(Date.now() + 86400000).toISOString(), revoked_at: null, last_seen_at: null };
  d1.sessionsByHash.set(session.session_hash, session); d1.sessionsById.set(session.id, session);

  const env = {
    MEMBERS_DB: d1,
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_CLIENT_ID: 'sandbox-client-id',
    PAYPAL_CLIENT_SECRET: 'sandbox-client-secret',
    PAYPAL_WEBHOOK_ID: 'WH-TEST123',
    PAYPAL_PLAN_SUPPORTER: 'P-SUPPORTER',
    PAYPAL_PLAN_INTELLIGENCE: 'P-INTELLIGENCE',
    PAYPAL_PLAN_RESEARCH_PRO: 'P-RESEARCH'
  };
  const cookie = 'matrix_session=' + encodeURIComponent(rawSession);
  let paypalStatus = 'ACTIVE';
  let expectedIntentId = '';
  let cancelCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'paypal-access-token', token_type: 'Bearer' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (target.includes('/v1/notifications/verify-webhook-signature')) return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (target.includes('/v1/billing/subscriptions/I-TEST-SUB/cancel')) { cancelCalls += 1; return new Response('', { status: 204 }); }
    if (target.includes('/v1/billing/subscriptions/I-TEST-SUB')) return new Response(JSON.stringify({ id: 'I-TEST-SUB', plan_id: 'P-SUPPORTER', custom_id: expectedIntentId, status: paypalStatus, subscriber: { payer_id: 'PAYER-1' }, billing_info: { next_billing_time: '2026-08-10T10:00:00Z', last_payment: { time: '2026-07-10T10:00:00Z', amount: { value: '9.00', currency_code: 'EUR' } } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return originalFetch(url, options);
  };

  const checks = [];
  try {
    const healthResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/paypal/health'), env);
    const health = await readJson(healthResponse);
    checks.push({ name: 'PayPal health proves schema and configuration without secrets', ok: healthResponse.status === 200 && health.ok === true && health.paypalSchemaReady === true && health.configured === true && health.environment === 'sandbox' && !JSON.stringify(health).includes('sandbox-client-secret') });

    const configResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/paypal/config', { headers: { cookie } }), env);
    const config = await readJson(configResponse);
    checks.push({ name: 'authenticated member receives public PayPal configuration only', ok: configResponse.status === 200 && config.configured === true && config.clientId === 'sandbox-client-id' && config.plans.supporter === 'P-SUPPORTER' && !JSON.stringify(config).includes('sandbox-client-secret') });

    const unauthConfig = await worker.fetch(new Request('https://matrixreprogrammed.com/api/paypal/config'), env);
    checks.push({ name: 'PayPal plan configuration requires member authentication', ok: unauthConfig.status === 401 });

    const intentResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/paypal/checkout-intent', { tier: 'supporter' }, { cookie }), env);
    const intent = await readJson(intentResponse);
    expectedIntentId = intent.intentId;
    checks.push({ name: 'checkout intent is bound to member, tier and configured Plan ID', ok: intentResponse.status === 200 && /^paypal-intent-/.test(intent.intentId || '') && intent.planId === 'P-SUPPORTER' && d1.intents.get(intent.intentId).member_id === member.id });

    const confirmResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/paypal/subscription/confirm', { subscriptionId: 'I-TEST-SUB', checkoutIntentId: intent.intentId }, { cookie }), env);
    const confirmed = await readJson(confirmResponse);
    checks.push({ name: 'server verifies PayPal subscription before activating tier', ok: confirmResponse.status === 200 && confirmed.verified === true && confirmed.paidAccess === true && confirmed.subscription.status === 'ACTIVE' && member.tier === 'supporter' && d1.subscriptions.get('I-TEST-SUB').provider_plan_id === 'P-SUPPORTER' });
    checks.push({ name: 'checkout intent becomes single-use after confirmation', ok: Boolean(d1.intents.get(intent.intentId).used_at) });

    const reuseResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/paypal/subscription/confirm', { subscriptionId: 'I-TEST-SUB', checkoutIntentId: intent.intentId }, { cookie }), env);
    checks.push({ name: 'confirmed checkout intent cannot be reused', ok: reuseResponse.status === 400 });

    const meResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/member/me', { headers: { cookie } }), env);
    const me = await readJson(meResponse);
    checks.push({ name: 'member identity exposes paid access only for ACTIVE PayPal status', ok: meResponse.status === 200 && me.paidAccessEnabled === true && me.member.tier === 'supporter' && me.subscription.status === 'ACTIVE' });

    const unsignedEvent = { id: 'WH-EVENT-UNSIGNED', event_type: 'BILLING.SUBSCRIPTION.SUSPENDED', resource: { id: 'I-TEST-SUB', custom_id: intent.intentId } };
    const unsignedResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/paypal/webhook', unsignedEvent), env);
    checks.push({ name: 'unsigned PayPal webhook is rejected', ok: unsignedResponse.status === 400 && !d1.events.has('WH-EVENT-UNSIGNED') });

    paypalStatus = 'SUSPENDED';
    const event = { id: 'WH-EVENT-SUSPEND', event_type: 'BILLING.SUBSCRIPTION.SUSPENDED', resource: { id: 'I-TEST-SUB', custom_id: intent.intentId } };
    const webhookHeaders = { 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.paypal.com/cert', 'paypal-transmission-id': 'transmission-1', 'paypal-transmission-sig': 'signature-1', 'paypal-transmission-time': new Date().toISOString() };
    const webhookResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/paypal/webhook', event, webhookHeaders), env);
    const webhook = await readJson(webhookResponse);
    checks.push({ name: 'verified webhook synchronizes suspension and removes paid tier', ok: webhookResponse.status === 200 && webhook.verified === true && webhook.processingStatus === 'processed' && d1.subscriptions.get('I-TEST-SUB').status === 'SUSPENDED' && member.tier === 'free' });

    const duplicateResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/paypal/webhook', event, webhookHeaders), env);
    const duplicate = await readJson(duplicateResponse);
    checks.push({ name: 'PayPal webhooks are idempotent by provider event ID', ok: duplicateResponse.status === 200 && duplicate.duplicate === true && d1.events.size === 1 });

    paypalStatus = 'ACTIVE';
    const stored = d1.subscriptions.get('I-TEST-SUB'); stored.status = 'ACTIVE'; member.tier = 'supporter';
    const cancelResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/paypal/subscription/cancel', { method: 'POST', headers: { cookie, accept: 'application/json' } }), env);
    const cancelled = await readJson(cancelResponse);
    checks.push({ name: 'member cancellation calls PayPal and removes entitlement', ok: cancelResponse.status === 200 && cancelled.cancelled === true && cancelCalls === 1 && stored.status === 'CANCELLED' && member.tier === 'free' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const marker of ['paypal-membership-v1:', '/v1/notifications/verify-webhook-signature', "originalPath==='/api/paypal/subscription/confirm'", "originalPath==='/api/paypal/webhook'", "paidAccessPolicy:'ACTIVE subscriptions only'"]) checks.push({ name: 'Worker contains ' + marker, ok: source.includes(marker) });
  const migration = fs.readFileSync(path.join(root, 'migrations', '0001_membership_foundation.sql'), 'utf8');
  checks.push({ name: 'deployment migration includes PayPal checkout intents', ok: migration.includes('CREATE TABLE IF NOT EXISTS paypal_checkout_intents') });

  const report = {
    ok: checks.every(check => check.ok),
    generatedAt: new Date().toISOString(),
    checks,
    subscriptions: d1.subscriptions.size,
    webhookEvents: d1.events.size,
    auditRecords: d1.audit.length,
    boundary: 'PayPal membership is healthy only when checkout intents are member-bound and single-use, the server re-fetches subscription details, webhook signatures are verified, webhook events are idempotent, and paid access exists only for an ACTIVE PayPal subscription.'
  };
  fs.writeFileSync(path.join(reportDir, 'paypal-membership-test.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, 'paypal-membership-test.md'), '# PayPal Membership Test\n\nGenerated: ' + report.generatedAt + '\nResult: ' + (report.ok ? 'PASS' : 'FAIL') + '\n\n' + checks.map(check => '- ' + (check.ok ? 'PASS' : 'FAIL') + ': ' + check.name).join('\n'));
  if (!report.ok) {
    console.error('PAYPAL MEMBERSHIP TEST FAILED');
    checks.filter(check => !check.ok).forEach(check => console.error('- ' + check.name));
    process.exit(1);
  }
  console.log('PAYPAL MEMBERSHIP TEST PASSED');
}

main().catch(error => {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: error.message, stack: error.stack };
  fs.writeFileSync(path.join(reportDir, 'paypal-membership-test.json'), JSON.stringify(report, null, 2));
  console.error(error.stack || error.message);
  process.exit(1);
});
