const workerOrigin = 'cloudflare-worker-paypal-sandbox-rehearsal';

const routes = new Set([
  '/api/paypal/admin/rehearsal/readiness',
  '/api/paypal/admin/rehearsal/start',
  '/api/paypal/admin/rehearsal/status',
  '/api/paypal/admin/rehearsal/complete',
  '/api/paypal/admin/rehearsal/abort',
  '/api/paypal/admin/rehearsals'
]);

const validTiers = new Set(['supporter', 'intelligence', 'research_pro']);
const expectedRuntimeTiers = {
  supporter: 'supporter_3',
  intelligence: 'intelligence_6',
  research_pro: 'research_pro_9'
};

export const paypalSandboxRehearsalRoutes = routes;
export function isPayPalSandboxRehearsalRoute(pathname = '') {
  return routes.has(pathname);
}

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': workerOrigin
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function clean(value, max = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeJson(value, max = 30000) {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length <= max ? text : JSON.stringify({ truncated: true });
  } catch {
    return '{}';
  }
}

function bool(value) {
  return value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
}

function environment(env) {
  return String(env?.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
}

function hasD1(env) {
  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
}

async function first(statement) {
  try {
    return await statement.first();
  } catch {
    return null;
  }
}

async function all(statement) {
  try {
    const result = await statement.all();
    return Array.isArray(result?.results) ? result.results : [];
  } catch {
    return [];
  }
}

async function requestBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function cookie(request, name = 'matrix_session') {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return '';
}

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticate(request, env) {
  if (!hasD1(env)) return null;
  const raw = cookie(request);
  if (!raw) return null;
  const sessionHash = await hash(raw);
  const session = await first(env.MEMBERS_DB.prepare(
    'SELECT id,member_id,expires_at,revoked_at FROM member_sessions WHERE session_hash=? LIMIT 1'
  ).bind(sessionHash));
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  const member = await first(env.MEMBERS_DB.prepare(
    "SELECT id,email,display_name,role,status FROM members WHERE id=? AND status='active' LIMIT 1"
  ).bind(session.member_id));
  if (!member) return null;
  const entitlement = await first(env.MEMBERS_DB.prepare(
    'SELECT effective_tier,is_admin FROM member_effective_entitlements WHERE member_id=? LIMIT 1'
  ).bind(member.id));
  return {
    session,
    member,
    isAdmin: Boolean(entitlement?.is_admin) || member.role === 'admin',
    effectiveTier: entitlement?.effective_tier || 'registered'
  };
}

async function requireAdmin(request, env) {
  const auth = await authenticate(request, env);
  if (!auth) return { response: json({ ok: false, authenticated: false, error: 'Authentication required' }, 401) };
  if (!auth.isAdmin) return { response: json({ ok: false, authenticated: true, error: 'Administrator access required' }, 403) };
  return { auth };
}

async function audit(env, actorId, action, targetId, metadata = {}) {
  await env.MEMBERS_DB.prepare(
    'INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)'
  ).bind(id('audit'), actorId || null, action, 'paypal_sandbox_rehearsal', targetId || null, safeJson(metadata, 12000), now()).run().catch(() => null);
}

async function evidence(env, runId, type, status = 'observed', referenceId = null, details = {}) {
  await env.MEMBERS_DB.prepare(
    'INSERT INTO paypal_sandbox_rehearsal_evidence (id,rehearsal_run_id,evidence_type,status,reference_id,details_json,observed_at) VALUES (?,?,?,?,?,?,?)'
  ).bind(id('rehearsal-evidence'), runId, type, status, referenceId || null, safeJson(details), now()).run();
}

async function runtimeSetting(env) {
  return await first(env.MEMBERS_DB.prepare(
    "SELECT environment,checkout_enabled,activation_reason,activated_by,activated_at,deactivated_at,updated_at FROM paypal_runtime_settings WHERE environment='sandbox' LIMIT 1"
  )) || { environment: 'sandbox', checkout_enabled: 0 };
}

async function activeRun(env) {
  return await first(env.MEMBERS_DB.prepare(
    "SELECT * FROM paypal_sandbox_rehearsal_runs WHERE status='active' AND datetime(expires_at)>datetime('now') ORDER BY started_at DESC LIMIT 1"
  ));
}

async function disableSandboxCheckout(env, reason, actorId = null) {
  const current = now();
  await env.MEMBERS_DB.prepare(
    "UPDATE paypal_runtime_settings SET checkout_enabled=0,activation_reason=?,activated_by=?,deactivated_at=?,updated_at=? WHERE environment='sandbox'"
  ).bind(clean(reason, 500), actorId || null, current, current).run();
}

async function expireStaleRuns(env) {
  const stale = await all(env.MEMBERS_DB.prepare(
    "SELECT id FROM paypal_sandbox_rehearsal_runs WHERE status='active' AND datetime(expires_at)<=datetime('now')"
  ));
  if (!stale.length) return 0;
  const current = now();
  for (const run of stale) {
    await env.MEMBERS_DB.prepare(
      "UPDATE paypal_sandbox_rehearsal_runs SET status='expired',checkout_disabled_at=?,failure_reason='Timed rehearsal window expired',updated_at=? WHERE id=? AND status='active'"
    ).bind(current, current, run.id).run();
    await evidence(env, run.id, 'expired', 'failed', null, { reason: 'Timed rehearsal window expired' }).catch(() => null);
  }
  await disableSandboxCheckout(env, 'Phase 7 rehearsal expired; checkout closed automatically');
  return stale.length;
}

async function closeOrphanedCheckout(env) {
  const setting = await runtimeSetting(env);
  const run = await activeRun(env);
  if (Boolean(setting.checkout_enabled) && !run) {
    await disableSandboxCheckout(env, 'Phase 7 safety closure: no active sandbox rehearsal');
    return true;
  }
  return false;
}

async function plans(env) {
  return await all(env.MEMBERS_DB.prepare(
    "SELECT tier,provider_plan_id,amount_value,currency_code,status FROM paypal_plans WHERE environment='sandbox' ORDER BY CASE tier WHEN 'supporter' THEN 1 WHEN 'intelligence' THEN 2 ELSE 3 END"
  ));
}

async function readinessSnapshot(env) {
  await expireStaleRuns(env);
  const orphanClosed = await closeOrphanedCheckout(env);
  const setting = await runtimeSetting(env);
  const planRows = await plans(env);
  const run = await activeRun(env);
  const checks = {
    sandboxEnvironment: environment(env) === 'sandbox',
    credentialsConfigured: Boolean(env?.PAYPAL_CLIENT_ID && env?.PAYPAL_CLIENT_SECRET && env?.PAYPAL_WEBHOOK_ID),
    sandboxSwitchEnabled: bool(env?.PAYPAL_SANDBOX_ENABLED),
    productionSwitchDisabled: !bool(env?.PAYPAL_PRODUCTION_ENABLED),
    threeActivePlans: planRows.length === 3 && planRows.every(row => String(row.status).toUpperCase() === 'ACTIVE'),
    noExistingRehearsal: !run,
    checkoutClosedBeforeStart: !Boolean(setting.checkout_enabled)
  };
  return {
    environment: environment(env),
    ready: Object.values(checks).every(Boolean),
    checks,
    plans: planRows,
    setting,
    activeRun: run,
    orphanClosed
  };
}

async function readiness(request, env) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  const snapshot = await readinessSnapshot(env);
  return json({ ok: true, ...snapshot, liveChargingEnabled: false });
}

async function start(request, env) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  const input = await requestBody(request);
  const phrase = String(input.phrase || '');
  const tier = clean(input.tier, 40);
  const email = clean(input.email, 320).toLowerCase();
  const durationMinutes = Math.max(5, Math.min(45, Number(input.durationMinutes || 20)));
  if (phrase !== 'START MATRIX PAYPAL SANDBOX REHEARSAL') {
    return json({ ok: false, error: 'Exact sandbox rehearsal phrase required' }, 400);
  }
  if (!validTiers.has(tier)) return json({ ok: false, error: 'Unknown target tier' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'A valid sandbox test member email is required' }, 400);
  const snapshot = await readinessSnapshot(env);
  if (!snapshot.ready) return json({ ok: false, error: 'Sandbox rehearsal readiness checks did not pass', readiness: snapshot }, 409);

  const runId = id('paypal-sandbox-rehearsal');
  const startedAt = now();
  const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
  await env.MEMBERS_DB.prepare(
    "INSERT INTO paypal_sandbox_rehearsal_runs (id,environment,status,target_tier,test_member_email,started_by,started_at,expires_at,checkout_enabled_before,created_at,updated_at) VALUES (?,'sandbox','active',?,?,?,?,?,?,?,?)"
  ).bind(runId, tier, email, required.auth.member.id, startedAt, expiresAt, snapshot.setting.checkout_enabled ? 1 : 0, startedAt, startedAt).run();
  await evidence(env, runId, 'started', 'observed', null, { tier, email, durationMinutes });
  await env.MEMBERS_DB.prepare(
    "UPDATE paypal_runtime_settings SET checkout_enabled=1,activation_reason=?,activated_by=?,activated_at=?,deactivated_at=NULL,updated_at=? WHERE environment='sandbox'"
  ).bind(`Phase 7 timed sandbox rehearsal ${runId}`, required.auth.member.id, startedAt, startedAt).run();
  await evidence(env, runId, 'checkout_opened', 'observed', null, { expiresAt });
  await audit(env, required.auth.member.id, 'paypal.sandbox_rehearsal.started', runId, { tier, email, expiresAt });
  return json({
    ok: true,
    runId,
    environment: 'sandbox',
    tier,
    email,
    startedAt,
    expiresAt,
    checkoutEnabled: true,
    liveChargingEnabled: false,
    membershipUrl: '/membership.html',
    billingUrl: '/billing-dashboard.html'
  }, 201);
}

async function getRun(env, runId = '') {
  if (runId) {
    return await first(env.MEMBERS_DB.prepare(
      'SELECT * FROM paypal_sandbox_rehearsal_runs WHERE id=? LIMIT 1'
    ).bind(runId));
  }
  return await first(env.MEMBERS_DB.prepare(
    'SELECT * FROM paypal_sandbox_rehearsal_runs ORDER BY started_at DESC LIMIT 1'
  ));
}

async function observe(env, run) {
  if (!run) return null;
  const before = { ...run };
  const member = await first(env.MEMBERS_DB.prepare(
    'SELECT id,email FROM members WHERE LOWER(email)=LOWER(?) LIMIT 1'
  ).bind(run.test_member_email));
  const subscription = member ? await first(env.MEMBERS_DB.prepare(
    "SELECT s.id AS local_subscription_id,s.provider_subscription_id,s.tier,s.created_at,p.billing_state,p.entitlement_active,p.last_event_type,p.last_event_at FROM subscriptions s JOIN paypal_subscription_state p ON p.subscription_id=s.id WHERE s.member_id=? AND s.provider='paypal' AND s.tier=? AND p.environment='sandbox' AND datetime(s.created_at)>=datetime(?) ORDER BY s.created_at DESC LIMIT 1"
  ).bind(member.id, run.target_tier, run.started_at)) : null;
  const entitlement = member ? await first(env.MEMBERS_DB.prepare(
    'SELECT effective_tier,paid_access FROM member_effective_entitlements WHERE member_id=? LIMIT 1'
  ).bind(member.id)) : null;
  const webhook = subscription ? await first(env.MEMBERS_DB.prepare(
    "SELECT v.provider_event_id,e.event_type,e.processing_status FROM paypal_webhook_verifications v JOIN payment_webhook_events e ON e.provider_event_id=v.provider_event_id WHERE v.verification_status='SUCCESS' AND e.payload_json LIKE ? ORDER BY e.received_at DESC LIMIT 1"
  ).bind(`%${subscription.provider_subscription_id}%`)) : null;
  const transition = subscription ? await first(env.MEMBERS_DB.prepare(
    'SELECT COUNT(*) AS count FROM paypal_subscription_transitions WHERE provider_subscription_id=?'
  ).bind(subscription.provider_subscription_id)) : { count: 0 };
  const payment = subscription ? await first(env.MEMBERS_DB.prepare(
    'SELECT COUNT(*) AS count FROM paypal_payment_records WHERE provider_subscription_id=?'
  ).bind(subscription.provider_subscription_id)) : { count: 0 };
  const cancellation = subscription ? await first(env.MEMBERS_DB.prepare(
    "SELECT event_type,to_state,created_at FROM paypal_subscription_transitions WHERE provider_subscription_id=? AND (to_state IN ('cancelled_period_end','cancelled','expired') OR event_type='member.cancel') ORDER BY created_at DESC LIMIT 1"
  ).bind(subscription.provider_subscription_id)) : null;

  const expectedTier = expectedRuntimeTiers[run.target_tier];
  const activeEntitlementNow = Boolean(subscription?.entitlement_active) && entitlement?.effective_tier === expectedTier;
  const current = now();
  const providerSubscriptionId = before.provider_subscription_id || subscription?.provider_subscription_id || null;
  const verifiedWebhookEventId = before.verified_webhook_event_id || webhook?.provider_event_id || null;
  const activeEntitlementSeenAt = before.active_entitlement_seen_at || (activeEntitlementNow ? current : null);
  const cancellationSeenAt = before.cancellation_seen_at || (cancellation ? current : null);
  const observedEffectiveTier = before.observed_effective_tier || entitlement?.effective_tier || null;

  await env.MEMBERS_DB.prepare(
    'UPDATE paypal_sandbox_rehearsal_runs SET provider_subscription_id=?,verified_webhook_event_id=?,active_entitlement_seen_at=?,cancellation_seen_at=?,observed_effective_tier=?,checks_json=?,updated_at=? WHERE id=?'
  ).bind(
    providerSubscriptionId,
    verifiedWebhookEventId,
    activeEntitlementSeenAt,
    cancellationSeenAt,
    observedEffectiveTier,
    safeJson({
      memberFound: Boolean(member),
      subscriptionFound: Boolean(subscription),
      activeEntitlementObserved: Boolean(activeEntitlementSeenAt),
      verifiedWebhookObserved: Boolean(verifiedWebhookEventId),
      transitionCount: Number(transition?.count || 0),
      paymentCount: Number(payment?.count || 0),
      cancellationObserved: Boolean(cancellationSeenAt)
    }),
    current,
    run.id
  ).run();

  if (!before.provider_subscription_id && subscription?.provider_subscription_id) {
    await evidence(env, run.id, 'subscription_found', 'observed', subscription.provider_subscription_id, { tier: subscription.tier });
  }
  if (!before.active_entitlement_seen_at && activeEntitlementNow) {
    await evidence(env, run.id, 'entitlement_active', 'passed', subscription?.provider_subscription_id, { effectiveTier: entitlement?.effective_tier });
  }
  if (!before.verified_webhook_event_id && webhook?.provider_event_id) {
    await evidence(env, run.id, 'webhook_verified', 'passed', webhook.provider_event_id, { eventType: webhook.event_type, processingStatus: webhook.processing_status });
  }
  if (!before.cancellation_seen_at && cancellation) {
    await evidence(env, run.id, 'cancellation_observed', 'passed', subscription?.provider_subscription_id, cancellation);
  }

  const refreshed = await getRun(env, run.id);
  const checks = {
    memberFound: Boolean(member),
    subscriptionFound: Boolean(subscription),
    activeEntitlementObserved: Boolean(refreshed?.active_entitlement_seen_at),
    verifiedWebhookObserved: Boolean(refreshed?.verified_webhook_event_id),
    transitionCount: Number(transition?.count || 0),
    paymentCount: Number(payment?.count || 0),
    cancellationObserved: Boolean(refreshed?.cancellation_seen_at)
  };
  return { run: refreshed, member, subscription, entitlement, webhook, cancellation, checks };
}

async function status(request, env) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  await expireStaleRuns(env);
  await closeOrphanedCheckout(env);
  const runId = clean(new URL(request.url).searchParams.get('runId'), 180);
  const run = await getRun(env, runId);
  if (!run) return json({ ok: false, error: 'Sandbox rehearsal not found' }, 404);
  const observed = await observe(env, run);
  const events = await all(env.MEMBERS_DB.prepare(
    'SELECT evidence_type,status,reference_id,details_json,observed_at FROM paypal_sandbox_rehearsal_evidence WHERE rehearsal_run_id=? ORDER BY observed_at ASC'
  ).bind(run.id));
  const setting = await runtimeSetting(env);
  return json({ ok: true, ...observed, evidence: events, checkoutEnabled: Boolean(setting.checkout_enabled), liveChargingEnabled: false });
}

async function complete(request, env) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  const input = await requestBody(request);
  const runId = clean(input.runId, 180);
  if (String(input.phrase || '') !== 'COMPLETE MATRIX PAYPAL SANDBOX REHEARSAL') {
    return json({ ok: false, error: 'Exact completion phrase required' }, 400);
  }
  const run = await getRun(env, runId);
  if (!run || run.status !== 'active') return json({ ok: false, error: 'Active sandbox rehearsal not found' }, 404);
  const observed = await observe(env, run);
  const checks = observed.checks;
  const passed = checks.subscriptionFound
    && checks.activeEntitlementObserved
    && checks.verifiedWebhookObserved
    && checks.transitionCount > 0
    && checks.paymentCount > 0
    && checks.cancellationObserved;
  if (!passed) return json({ ok: false, error: 'The complete purchase, webhook, entitlement, payment and cancellation evidence chain is not finished', checks }, 409);

  const current = now();
  await disableSandboxCheckout(env, `Phase 7 rehearsal ${run.id} passed and closed`, required.auth.member.id);
  await env.MEMBERS_DB.prepare(
    "UPDATE paypal_sandbox_rehearsal_runs SET status='passed',completed_at=?,checkout_disabled_at=?,checks_json=?,updated_at=? WHERE id=? AND status='active'"
  ).bind(current, current, safeJson(checks), current, run.id).run();
  await evidence(env, run.id, 'checkout_closed', 'passed', null, { reason: 'Rehearsal completed' });
  await evidence(env, run.id, 'passed', 'passed', observed.subscription?.provider_subscription_id || null, checks);
  await audit(env, required.auth.member.id, 'paypal.sandbox_rehearsal.passed', run.id, checks);
  return json({ ok: true, runId: run.id, status: 'passed', checks, checkoutEnabled: false, liveChargingEnabled: false });
}

async function abort(request, env) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  const input = await requestBody(request);
  const runId = clean(input.runId, 180);
  const reason = clean(input.reason || 'Aborted by administrator', 700);
  if (String(input.phrase || '') !== 'ABORT MATRIX PAYPAL SANDBOX REHEARSAL') {
    return json({ ok: false, error: 'Exact abort phrase required' }, 400);
  }
  const run = await getRun(env, runId);
  if (!run || run.status !== 'active') return json({ ok: false, error: 'Active sandbox rehearsal not found' }, 404);
  const current = now();
  await disableSandboxCheckout(env, `Phase 7 rehearsal ${run.id} aborted: ${reason}`, required.auth.member.id);
  await env.MEMBERS_DB.prepare(
    "UPDATE paypal_sandbox_rehearsal_runs SET status='aborted',completed_at=?,checkout_disabled_at=?,failure_reason=?,updated_at=? WHERE id=? AND status='active'"
  ).bind(current, current, reason, current, run.id).run();
  await evidence(env, run.id, 'aborted', 'failed', null, { reason });
  await audit(env, required.auth.member.id, 'paypal.sandbox_rehearsal.aborted', run.id, { reason });
  return json({ ok: true, runId: run.id, status: 'aborted', checkoutEnabled: false, liveChargingEnabled: false });
}

async function listRuns(request, env) {
  const required = await requireAdmin(request, env);
  if (required.response) return required.response;
  await expireStaleRuns(env);
  const rows = await all(env.MEMBERS_DB.prepare(
    'SELECT * FROM paypal_sandbox_rehearsal_summary ORDER BY started_at DESC LIMIT 100'
  ));
  return json({ ok: true, count: rows.length, rehearsals: rows, liveChargingEnabled: false });
}

export async function enforceSandboxRehearsalGate(env) {
  if (!hasD1(env)) return { allowed: false, reason: 'membership-database-unavailable', run: null };
  if (environment(env) !== 'sandbox') return { allowed: true, reason: 'not-sandbox', run: null };
  await expireStaleRuns(env);
  await closeOrphanedCheckout(env);
  const run = await activeRun(env);
  const setting = await runtimeSetting(env);
  const allowed = Boolean(run) && Boolean(setting.checkout_enabled) && bool(env?.PAYPAL_SANDBOX_ENABLED) && !bool(env?.PAYPAL_PRODUCTION_ENABLED);
  return {
    allowed,
    reason: allowed ? 'active-timed-sandbox-rehearsal' : 'sandbox-checkout-requires-active-rehearsal',
    run
  };
}

async function route(request, env) {
  if (!hasD1(env)) return json({ ok: false, error: 'Membership database unavailable' }, 503);
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/paypal/admin/rehearsal/readiness' && request.method === 'GET') return readiness(request, env);
  if (path === '/api/paypal/admin/rehearsal/start' && request.method === 'POST') return start(request, env);
  if (path === '/api/paypal/admin/rehearsal/status' && request.method === 'GET') return status(request, env);
  if (path === '/api/paypal/admin/rehearsal/complete' && request.method === 'POST') return complete(request, env);
  if (path === '/api/paypal/admin/rehearsal/abort' && request.method === 'POST') return abort(request, env);
  if (path === '/api/paypal/admin/rehearsals' && request.method === 'GET') return listRuns(request, env);
  return json({ ok: false, error: 'Sandbox rehearsal route not found' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      return json({ ok: false, error: 'Sandbox rehearsal failed safely', message: clean(error?.message || error, 700) }, 500);
    }
  },
  async scheduled(event, env) {
    if (!hasD1(env)) return;
    await expireStaleRuns(env);
    await closeOrphanedCheckout(env);
  }
};
