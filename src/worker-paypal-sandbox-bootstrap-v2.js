const workerOrigin = 'cloudflare-worker-paypal-sandbox-bootstrap';

const definitions = {
  supporter: { label: 'Supporter', price: '3.00' },
  intelligence: { label: 'Intelligence Member', price: '6.00' },
  research_pro: { label: 'Research Pro', price: '9.00' }
};

const bootstrapRoutes = new Set(['/api/paypal/bootstrap-health']);
export function isPayPalSandboxBootstrapRoute(pathname = '') {
  return bootstrapRoutes.has(pathname);
}

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': workerOrigin
};

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers });
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const bool = value => value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
const clean = (value, max = 700) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const hasD1 = env => Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
const isSandbox = env => String(env?.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() !== 'live';
const configured = env => Boolean(env?.PAYPAL_CLIENT_ID && env?.PAYPAL_CLIENT_SECRET && env?.PAYPAL_WEBHOOK_ID);

async function first(statement) {
  try { return await statement.first(); } catch { return null; }
}
async function all(statement) {
  try {
    const result = await statement.all();
    return Array.isArray(result?.results) ? result.results : [];
  } catch { return []; }
}
function safeJson(value) {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length <= 20000 ? text : JSON.stringify({ truncated: true });
  } catch { return '{}'; }
}

async function getToken(env) {
  if (!configured(env)) throw new Error('PayPal sandbox credentials or webhook ID are missing');
  const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: 'grant_type=client_credentials'
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text || '{}'); } catch {}
  if (!response.ok || !payload.access_token) throw new Error(clean(payload.error_description || payload.message || text || `PayPal OAuth HTTP ${response.status}`));
  return payload.access_token;
}

async function paypal(token, pathname, { method = 'GET', requestId, body } = {}) {
  const response = await fetch(`https://api-m.sandbox.paypal.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'PayPal-Request-Id': requestId || uid('phase8-request')
    },
    body
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  }
  if (!response.ok) throw new Error(clean(payload.message || payload.error_description || payload.name || text || `PayPal HTTP ${response.status}`, 900));
  return payload;
}

function priceFromPlan(plan) {
  const cycle = Array.isArray(plan?.billing_cycles)
    ? plan.billing_cycles.find(item => String(item?.tenure_type || '').toUpperCase() === 'REGULAR')
    : null;
  return {
    value: clean(cycle?.pricing_scheme?.fixed_price?.value || '', 40),
    currency: clean(cycle?.pricing_scheme?.fixed_price?.currency_code || '', 10).toUpperCase()
  };
}

function productBody(definition) {
  return JSON.stringify({
    name: `Matrix Reprogrammed ${definition.label}`,
    description: `Monthly ${definition.label} membership`,
    type: 'SERVICE',
    category: 'SOFTWARE'
  });
}

function planBody(productId, definition) {
  return JSON.stringify({
    product_id: productId,
    name: `Matrix Reprogrammed ${definition.label}`,
    description: `${definition.label} monthly membership`,
    status: 'ACTIVE',
    billing_cycles: [{
      frequency: { interval_unit: 'MONTH', interval_count: 1 },
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: { value: definition.price, currency_code: 'EUR' } }
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: '0.00', currency_code: 'EUR' },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 2
    }
  });
}

async function getStatus(env) {
  return first(env.MEMBERS_DB.prepare("SELECT * FROM paypal_sandbox_bootstrap_status WHERE environment='sandbox' LIMIT 1"));
}
async function getPlans(env) {
  return all(env.MEMBERS_DB.prepare("SELECT tier,provider_product_id,provider_plan_id,amount_value,currency_code,status FROM paypal_plans WHERE environment='sandbox' ORDER BY CASE tier WHEN 'supporter' THEN 1 WHEN 'intelligence' THEN 2 ELSE 3 END"));
}
async function getRuntime(env) {
  return first(env.MEMBERS_DB.prepare("SELECT checkout_enabled,activation_reason,updated_at FROM paypal_runtime_settings WHERE environment='sandbox' LIMIT 1")) || { checkout_enabled: 0, activation_reason: '' };
}

function plansReady(rows) {
  return rows.length === 3 && Object.entries(definitions).every(([tier, definition]) => {
    const row = rows.find(item => item.tier === tier);
    return row
      && Boolean(row.provider_product_id)
      && Boolean(row.provider_plan_id)
      && String(row.amount_value) === definition.price
      && String(row.currency_code).toUpperCase() === 'EUR'
      && String(row.status).toUpperCase() === 'ACTIVE';
  });
}

async function setStatus(env, values) {
  const previous = await getStatus(env);
  const current = now();
  const row = {
    status: values.status ?? previous?.status ?? 'pending',
    attemptCount: Number(values.attemptCount ?? previous?.attempt_count ?? 0),
    configured: values.configured ?? Boolean(previous?.configured),
    sandboxSwitch: values.sandboxSwitch ?? Boolean(previous?.sandbox_switch_enabled),
    productionDisabled: values.productionDisabled ?? (previous ? Boolean(previous.production_switch_disabled) : true),
    productCount: Number(values.productCount ?? previous?.product_count ?? 0),
    planCount: Number(values.planCount ?? previous?.plan_count ?? 0),
    ready: values.ready ?? Boolean(previous?.plans_ready),
    lastAttemptAt: values.lastAttemptAt ?? previous?.last_attempt_at ?? null,
    lastSuccessAt: values.lastSuccessAt ?? previous?.last_success_at ?? null,
    error: values.error === undefined ? (previous?.last_error || null) : values.error,
    details: values.details ?? (() => { try { return JSON.parse(previous?.details_json || '{}'); } catch { return {}; } })()
  };
  await env.MEMBERS_DB.prepare(
    `INSERT INTO paypal_sandbox_bootstrap_status (
      environment,status,attempt_count,configured,sandbox_switch_enabled,production_switch_disabled,
      product_count,plan_count,plans_ready,last_attempt_at,last_success_at,last_error,details_json,updated_at,created_at
    ) VALUES ('sandbox',?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(environment) DO UPDATE SET
      status=excluded.status,attempt_count=excluded.attempt_count,configured=excluded.configured,
      sandbox_switch_enabled=excluded.sandbox_switch_enabled,production_switch_disabled=excluded.production_switch_disabled,
      product_count=excluded.product_count,plan_count=excluded.plan_count,plans_ready=excluded.plans_ready,
      last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,last_error=excluded.last_error,
      details_json=excluded.details_json,updated_at=excluded.updated_at`
  ).bind(
    row.status,
    row.attemptCount,
    row.configured ? 1 : 0,
    row.sandboxSwitch ? 1 : 0,
    row.productionDisabled ? 1 : 0,
    row.productCount,
    row.planCount,
    row.ready ? 1 : 0,
    row.lastAttemptAt,
    row.lastSuccessAt,
    row.error,
    safeJson(row.details),
    current,
    previous?.created_at || current
  ).run();
  return row;
}

async function saveProduct(env, tier, productId, definition) {
  const current = now();
  await env.MEMBERS_DB.prepare(
    `INSERT INTO paypal_products (id,environment,tier,provider_product_id,name,description,status,created_at,updated_at)
     VALUES (?,'sandbox',?,?,?,?,?,'active',?,?)
     ON CONFLICT(environment,tier) DO UPDATE SET provider_product_id=excluded.provider_product_id,
       name=excluded.name,description=excluded.description,status='active',updated_at=excluded.updated_at`
  ).bind(uid('paypal-product'), tier, productId, `Matrix Reprogrammed ${definition.label}`, `Monthly ${definition.label} membership`, current, current).run();
}

async function savePlan(env, tier, productId, planId, definition, status) {
  const current = now();
  await env.MEMBERS_DB.prepare(
    `INSERT INTO paypal_plans (
      id,environment,tier,provider_product_id,provider_plan_id,amount_value,currency_code,
      interval_unit,interval_count,status,payment_failure_threshold,created_at,updated_at
    ) VALUES (?,'sandbox',?,?,?,?,?,'EUR','MONTH',1,?,2,?,?)
    ON CONFLICT(environment,tier) DO UPDATE SET provider_product_id=excluded.provider_product_id,
      provider_plan_id=excluded.provider_plan_id,amount_value=excluded.amount_value,currency_code='EUR',
      interval_unit='MONTH',interval_count=1,status=excluded.status,payment_failure_threshold=2,
      updated_at=excluded.updated_at`
  ).bind(uid('paypal-plan'), tier, productId, planId, definition.price, String(status || 'ACTIVE').toUpperCase(), current, current).run();
}

async function ensureTier(env, token, tier, definition) {
  let product = await first(env.MEMBERS_DB.prepare("SELECT * FROM paypal_products WHERE environment='sandbox' AND tier=? LIMIT 1").bind(tier));
  if (!product?.provider_product_id) {
    const created = await paypal(token, '/v1/catalogs/products', {
      method: 'POST',
      requestId: `matrix-phase8-product-${tier}-v1`,
      body: productBody(definition)
    });
    await saveProduct(env, tier, created.id, definition);
    product = { provider_product_id: created.id };
  }

  let localPlan = await first(env.MEMBERS_DB.prepare("SELECT * FROM paypal_plans WHERE environment='sandbox' AND tier=? LIMIT 1").bind(tier));
  let remotePlan = null;
  if (localPlan?.provider_plan_id) {
    try { remotePlan = await paypal(token, `/v1/billing/plans/${encodeURIComponent(localPlan.provider_plan_id)}`); } catch {}
  }

  let remotePrice = priceFromPlan(remotePlan);
  const matching = remotePlan && remotePrice.value === definition.price && remotePrice.currency === 'EUR';
  if (matching && String(remotePlan.status).toUpperCase() !== 'ACTIVE') {
    await paypal(token, `/v1/billing/plans/${encodeURIComponent(remotePlan.id)}/activate`, {
      method: 'POST',
      requestId: `matrix-phase8-activate-${tier}-${remotePlan.id}`
    });
    remotePlan = await paypal(token, `/v1/billing/plans/${encodeURIComponent(remotePlan.id)}`);
    remotePrice = priceFromPlan(remotePlan);
  }

  if (!remotePlan || remotePrice.value !== definition.price || remotePrice.currency !== 'EUR') {
    remotePlan = await paypal(token, '/v1/billing/plans', {
      method: 'POST',
      requestId: `matrix-phase8-plan-${tier}-${definition.price.replace('.', '-')}-v1`,
      body: planBody(product.provider_product_id, definition)
    });
    remotePrice = priceFromPlan(remotePlan);
  }

  if (!remotePlan?.id
    || String(remotePlan.status).toUpperCase() !== 'ACTIVE'
    || remotePrice.value !== definition.price
    || remotePrice.currency !== 'EUR') {
    throw new Error(`${tier} plan did not verify ACTIVE at EUR ${definition.price}`);
  }

  await savePlan(env, tier, product.provider_product_id, remotePlan.id, definition, remotePlan.status);
  return { tier, amount: definition.price, currency: 'EUR', status: 'ACTIVE' };
}

export async function ensureSandboxPlans(env, { trigger = 'scheduled' } = {}) {
  if (!hasD1(env)) return { ok: false, ready: false, reason: 'membership-database-unavailable' };

  const existing = await getPlans(env);
  const safe = {
    environment: isSandbox(env),
    configured: configured(env),
    sandboxSwitch: bool(env?.PAYPAL_SANDBOX_ENABLED),
    productionDisabled: !bool(env?.PAYPAL_PRODUCTION_ENABLED)
  };

  if (plansReady(existing)) {
    await setStatus(env, {
      status: 'ready', configured: safe.configured, sandboxSwitch: safe.sandboxSwitch,
      productionDisabled: safe.productionDisabled, productCount: 3, planCount: 3, ready: true,
      lastSuccessAt: (await getStatus(env))?.last_success_at || now(), error: null,
      details: { trigger, source: 'verified-d1', prices: ['3.00', '6.00', '9.00'] }
    });
    return { ok: true, ready: true, source: 'verified-d1', plans: existing };
  }

  if (!Object.values(safe).every(Boolean)) {
    await setStatus(env, {
      status: 'blocked', configured: safe.configured, sandboxSwitch: safe.sandboxSwitch,
      productionDisabled: safe.productionDisabled, productCount: existing.filter(row => row.provider_product_id).length,
      planCount: existing.length, ready: false, error: 'Sandbox bootstrap safety checks did not pass', details: { trigger, safe }
    });
    return { ok: false, ready: false, reason: 'sandbox-bootstrap-safety-check-failed', checks: safe };
  }

  const previous = await getStatus(env);
  const attempt = Number(previous?.attempt_count || 0) + 1;
  const attemptedAt = now();
  await setStatus(env, {
    status: 'running', attemptCount: attempt, configured: true, sandboxSwitch: true,
    productionDisabled: true, ready: false, lastAttemptAt: attemptedAt, error: null, details: { trigger }
  });

  try {
    const token = await getToken(env);
    const results = [];
    for (const [tier, definition] of Object.entries(definitions)) results.push(await ensureTier(env, token, tier, definition));
    const rows = await getPlans(env);
    if (!plansReady(rows)) throw new Error('Three active EUR sandbox plans were not present after bootstrap');
    await setStatus(env, {
      status: 'ready', attemptCount: attempt, configured: true, sandboxSwitch: true,
      productionDisabled: true, productCount: 3, planCount: 3, ready: true,
      lastAttemptAt: attemptedAt, lastSuccessAt: now(), error: null, details: { trigger, results }
    });
    return { ok: true, ready: true, plans: results };
  } catch (error) {
    const message = clean(error?.message || error, 900);
    const rows = await getPlans(env);
    await setStatus(env, {
      status: 'failed', attemptCount: attempt, configured: true, sandboxSwitch: true,
      productionDisabled: true, productCount: rows.filter(row => row.provider_product_id).length,
      planCount: rows.length, ready: false, lastAttemptAt: attemptedAt, error: message, details: { trigger }
    });
    return { ok: false, ready: false, reason: 'sandbox-plan-bootstrap-failed', error: message };
  }
}

async function bootstrapHealth(env) {
  if (!hasD1(env)) return json({ ok: false, ready: false, error: 'Membership database unavailable' }, 503);
  let status = await getStatus(env);
  const stale = !status?.last_attempt_at || Date.now() - Date.parse(status.last_attempt_at) > 5 * 60 * 1000;
  if ((!status?.plans_ready || status?.status !== 'ready') && stale) {
    await ensureSandboxPlans(env, { trigger: 'health-self-heal' });
    status = await getStatus(env);
  }
  const rows = await getPlans(env);
  const runtime = await getRuntime(env);
  const ready = Boolean(status?.plans_ready) && plansReady(rows);
  return json({
    ok: ready,
    ready,
    environment: 'sandbox',
    configured: Boolean(status?.configured),
    sandboxSwitchEnabled: Boolean(status?.sandbox_switch_enabled),
    productionSwitchDisabled: Boolean(status?.production_switch_disabled),
    status: status?.status || 'pending',
    attemptCount: Number(status?.attempt_count || 0),
    productCount: Number(status?.product_count || 0),
    planCount: rows.length,
    plansReady: ready,
    prices: rows.map(row => ({ tier: row.tier, amount: row.amount_value, currency: row.currency_code, status: row.status })),
    lastAttemptAt: status?.last_attempt_at || null,
    lastSuccessAt: status?.last_success_at || null,
    error: ready ? null : clean(status?.last_error || 'Sandbox plans are not ready', 300),
    databaseCheckoutEnabled: Boolean(runtime.checkout_enabled),
    liveChargingEnabled: false
  }, ready ? 200 : 503);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/paypal/bootstrap-health' && request.method === 'GET') return bootstrapHealth(env);
    return json({ ok: false, error: 'Sandbox bootstrap route not found' }, 404);
  },
  async scheduled(event, env) {
    await ensureSandboxPlans(env, { trigger: 'cloudflare-cron' });
  }
};
