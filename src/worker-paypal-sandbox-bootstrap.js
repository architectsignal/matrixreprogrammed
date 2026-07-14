const workerOrigin = 'cloudflare-worker-paypal-sandbox-bootstrap';

const tierDefinitions = {
  supporter: { label: 'Supporter', price: '3.00' },
  intelligence: { label: 'Intelligence Member', price: '6.00' },
  research_pro: { label: 'Research Pro', price: '9.00' }
};

const routes = new Set(['/api/paypal/bootstrap-health']);
export const paypalSandboxBootstrapRoutes = routes;
export function isPayPalSandboxBootstrapRoute(pathname = '') {
  return routes.has(pathname);
}

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': workerOrigin
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: responseHeaders });
}

function now() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function clean(value, max = 700) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function bool(value) {
  return value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
}

function hasD1(env) {
  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
}

function isSandbox(env) {
  return String(env?.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() !== 'live';
}

function configured(env) {
  return Boolean(env?.PAYPAL_CLIENT_ID && env?.PAYPAL_CLIENT_SECRET && env?.PAYPAL_WEBHOOK_ID);
}

function safeJson(value, max = 20000) {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length <= max ? text : JSON.stringify({ truncated: true });
  } catch {
    return '{}';
  }
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

async function accessToken(env) {
  if (!configured(env)) throw new Error('PayPal sandbox credentials or webhook ID are missing');
  const credential = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credential}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: 'grant_type=client_credentials'
  });
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text || '{}'); } catch {}
  if (!response.ok || !payload.access_token) {
    throw new Error(clean(payload.error_description || payload.message || text || `PayPal OAuth HTTP ${response.status}`));
  }
  return payload.access_token;
}

async function paypal(token, pathname, options = {}) {
  const response = await fetch(`https://api-m.sandbox.paypal.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'PayPal-Request-Id': options.requestId || uid('phase8-request'),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  }
  if (!response.ok) {
    throw new Error(clean(payload.message || payload.error_description || payload.name || text || `PayPal HTTP ${response.status}`, 900));
  }
  return payload;
}

function planPrice(details) {
  const cycle = Array.isArray(details?.billing_cycles)
    ? details.billing_cycles.find(item => String(item?.tenure_type || '').toUpperCase() === 'REGULAR')
    : null;
  return {
    value: clean(cycle?.pricing_scheme?.fixed_price?.value || '', 40),
    currency: clean(cycle?.pricing_scheme?.fixed_price?.currency_code || '', 10).toUpperCase()
  };
}

function productPayload(definition) {
  return {
    name: `Matrix Reprogrammed ${definition.label}`,
    description: `Monthly ${definition.label} membership`,
    type: 'SERVICE',
    category: 'SOFTWARE'
  };
}

function planPayload(productId, definition) {
  return {
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
  };
}

async function statusRow(env) {
  return await first(env.MEMBERS_DB.prepare(
    "SELECT * FROM paypal_sandbox_bootstrap_status WHERE environment='sandbox' LIMIT 1"
  ));
}

async function planRows(env) {
  return await all(env.MEMBERS_DB.prepare(
    "SELECT tier,provider_product_id,provider_plan_id,amount_value,currency_code,status FROM paypal_plans WHERE environment='sandbox' ORDER BY CASE tier WHEN 'supporter' THEN 1 WHEN 'intelligence' THEN 2 ELSE 3 END"
  ));
}

async function runtimeSetting(env) {
  return await first(env.MEMBERS_DB.prepare(
    "SELECT checkout_enabled,activation_reason,updated_at FROM paypal_runtime_settings WHERE environment='sandbox' LIMIT 1"
  )) || { checkout_enabled: 0, activation_reason: '' };
}

function rowsReady(rows) {
  if (rows.length !== 3) return false;
  return Object.entries(tierDefinitions).every(([tier, definition]) => {
    const row = rows.find(item => item.tier === tier);
    return row
      && String(row.status || '').toUpperCase() === 'ACTIVE'
      && String(row.amount_value || '') === definition.price
      && String(row.currency_code || '').toUpperCase() === 'EUR'
      && Boolean(row.provider_product_id)
      && Boolean(row.provider_plan_id);
  });
}

async function writeStatus(env, fields) {
  const current = now();
  const previous = await statusRow(env);
  const merged = {
    status: fields.status || previous?.status || 'pending',
    attemptCount: Number(fields.attemptCount ?? previous?.attempt_count ?? 0),
    configured: fields.configured ?? Boolean(previous?.configured),
    sandboxSwitchEnabled: fields.sandboxSwitchEnabled ?? Boolean(previous?.sandbox_switch_enabled),
    productionSwitchDisabled: fields.productionSwitchDisabled ?? (previous ? Boolean(previous.production_switch_disabled) : true),
    productCount: Number(fields.productCount ?? previous?.product_count ?? 0),
    planCount: Number(fields.planCount ?? previous?.plan_count ?? 0),
    plansReady: fields.plansReady ?? Boolean(previous?.plans_ready),
    lastAttemptAt: fields.lastAttemptAt ?? previous?.last_attempt_at ?? null,
    lastSuccessAt: fields.lastSuccessAt ?? previous?.last_success_at ?? null,
    lastError: fields.lastError === undefined ? (previous?.last_error || null) : fields.lastError,
    details: fields.details ?? (() => { try { return JSON.parse(previous?.details_json || '{}'); } catch { return {}; } })()
  };
  await env.MEMBERS_DB.prepare(
    `INSERT INTO paypal_sandbox_bootstrap_status (
      environment,status,attempt_count,configured,sandbox_switch_enabled,
      production_switch_disabled,product_count,plan_count,plans_ready,
      last_attempt_at,last_success_at,last_error,details_json,updated_at,created_at
    ) VALUES ('sandbox',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(environment) DO UPDATE SET
      status=excluded.status,
      attempt_count=excluded.attempt_count,
      configured=excluded.configured,
      sandbox_switch_enabled=excluded.sandbox_switch_enabled,
      production_switch_disabled=excluded.production_switch_disabled,
      product_count=excluded.product_count,
      plan_count=excluded.plan_count,
      plans_ready=excluded.plans_ready,
      last_attempt_at=excluded.last_attempt_at,
      last_success_at=excluded.last_success_at,
      last_error=excluded.last_error,
      details_json=excluded.details_json,
      updated_at=excluded.updated_at`
  ).bind(
    merged.status,
    merged.attemptCount,
    merged.configured ? 1 : 0,
    merged.sandboxSwitchEnabled ? 1 : 0,
    merged.productionSwitchDisabled ? 1 : 0,
    merged.productCount,
    merged.planCount,
    merged.plansReady ? 1 : 0,
    merged.lastAttemptAt,
    merged.lastSuccessAt,
    merged.lastError,
    safeJson(merged.details),
    current,
    previous?.created_at || current
  ).run();
  return merged;
}

async function upsertProduct(env, tier, providerProductId, definition) {
  const current = now();
  await env.MEMBERS_DB.prepare(
    `INSERT INTO paypal_products (id,environment,tier,provider_product_id,name,description,status,created_at,updated_at)
     VALUES (?,'sandbox',?,?,?,?,?,'active',?,?)
     ON CONFLICT(environment,tier) DO UPDATE SET
       provider_product_id=excluded.provider_product_id,
       name=excluded.name,
       description=excluded.description,
       status='active',
       updated_at=excluded.updated_at`
  ).bind(
    uid('paypal-product'),
    tier,
    providerProductId,
    `Matrix Reprogrammed ${definition.label}`,
    `Monthly ${definition.label} membership`,
    current,
    current
  ).run();
}

async function upsertPlan(env, tier, productId, planId, definition, status = 'ACTIVE') {
  const current = now();
  await env.MEMBERS_DB.prepare(
    `INSERT INTO paypal_plans (
      id,environment,tier,provider_product_id,provider_plan_id,amount_value,currency_code,
      interval_unit,interval_count,status,payment_failure_threshold,created_at,updated_at
    ) VALUES (?,'sandbox',?,?,?,?,?,'EUR','MONTH',1,?,2,?,?)
    ON CONFLICT(environment,tier) DO UPDATE SET
      provider_product_id=excluded.provider_product_id,
      provider_plan_id=excluded.provider_plan_id,
      amount_value=excluded.amount_value,
      currency_code='EUR',
      interval_unit='MONTH',
      interval_count=1,
      status=excluded.status,
      payment_failure_threshold=2,
      updated_at=excluded.updated_at`
  ).bind(
    uid('paypal-plan'),
    tier,
    productId,
    planId,
    definition.price,
    String(status || 'ACTIVE').toUpperCase(),
    current,
    current
  ).run();
}

async function ensureTier(env, token, tier, definition) {
  let product = await first(env.MEMBERS_DB.prepare(
    "SELECT * FROM paypal_products WHERE environment='sandbox' AND tier=? LIMIT 1"
  ).bind(tier));

  if (!product?.provider_product_id) {
    const created = await paypal(token, '/v1/catalogs/products', {
      method: 'POST',
      requestId: `matrix-phase8-sandbox-product-${tier}-v1`,
      body: JSON.stringify(productPayload(definition))
    });
    await upsertProduct(env, tier, created.id, definition);
    product = { provider_product_id: created.id };
  }

  let plan = await first(env.MEMBERS_DB.prepare(
    "SELECT * FROM paypal_plans WHERE environment='sandbox' AND tier=? LIMIT 1"
  ).bind(tier));

  let details = null;
  if (plan?.provider_plan_id) {
    try {
      details = await paypal(token, `/v1/billing/plans/${encodeURIComponent(plan.provider_plan_id)}`, { method: 'GET' });
    } catch {
      details = null;
    }
  }

  const currentPrice = planPrice(details);
  const currentStatus = String(details?.status || plan?.status || '').toUpperCase();
  const matches = details
    && currentPrice.value === definition.price
    && currentPrice.currency === 'EUR';

  if (details && matches && currentStatus !== 'ACTIVE') {
    await paypal(token, `/v1/billing/plans/${encodeURIComponent(plan.provider_plan_id)}/activate`, {
      method: 'POST',
      requestId: `matrix-phase8-activate-${tier}-${plan.provider_plan_id}`
    });
    details = await paypal(token, `/v1/billing/plans/${encodeURIComponent(plan.provider_plan_id)}`, { method: 'GET' });
  }

  if (!details || !matches) {
    const created = await paypal(token, '/v1/billing/plans', {
      method: 'POST',
      requestId: `matrix-phase8-sandbox-plan-${tier}-${definition.price.replace('.', '-')}-v1`,
      body: JSON.stringify(planPayload(product.provider_product_id, definition))
    });
    details = created;
  }

  const verifiedPrice = planPrice(details);
  if (String(details?.status || '').toUpperCase() !== 'ACTIVE'
    || verifiedPrice.value !== definition.price
    || verifiedPrice.currency !== 'EUR') {
    throw new Error(`${tier} sandbox plan did not verify at EUR ${definition.price} ACTIVE`);
  }

  await upsertPlan(
    env,
    tier,
    product.provider_product_id,
    details.id,
    definition,
    details.status
  );

  return {
    tier,
    price: definition.price,
    currency: 'EUR',
    status: String(details.status).toUpperCase()
  };
}

export async function ensureSandboxPlans(env, options = {}) {
  if (!hasD1(env)) return { ok: false, ready: false, reason: 'membership-database-unavailable' };

  const currentStatus = await statusRow(env);
  const existingRows = await planRows(env);
  const sandboxSwitchEnabled = bool(env?.PAYPAL_SANDBOX_ENABLED);
  const productionSwitchDisabled = !bool(env?.PAYPAL_PRODUCTION_ENABLED);
  const credentialsConfigured = configured(env);
  const environmentSafe = isSandbox(env);

  if (rowsReady(existingRows)) {
    await writeStatus(env, {
      status: 'ready',
      configured: credentialsConfigured,
      sandboxSwitchEnabled,
      productionSwitchDisabled,
      productCount: 3,
      planCount: 3,
      plansReady: true,
      lastSuccessAt: currentStatus?.last_success_at || now(),
      lastError: null,
      details: { source: 'existing-verified-d1-rows', prices: ['3.00', '6.00', '9.00'] }
    });
    return { ok: true, ready: true, source: 'existing-verified-d1-rows', plans: existingRows };
  }

  if (!environmentSafe || !sandboxSwitchEnabled || !productionSwitchDisabled || !credentialsConfigured) {
    const checks = { environmentSafe, credentialsConfigured, sandboxSwitchEnabled, productionSwitchDisabled };
    await writeStatus(env, {
      status: 'blocked',
      configured: credentialsConfigured,
      sandboxSwitchEnabled,
      productionSwitchDisabled,
      productCount: existingRows.filter(row => row.provider_product_id).length,
      planCount: existingRows.length,
      plansReady: false,
      lastError: 'Sandbox plan bootstrap safety checks did not pass',
      details: { checks }
    });
    return { ok: false, ready: false, reason: 'sandbox-bootstrap-safety-check-failed', checks };
  }

  const attemptAt = now();
  const attemptCount = Number(currentStatus?.attempt_count || 0) + 1;
  await writeStatus(env, {
    status: 'running',
    attemptCount,
    configured: true,
    sandboxSwitchEnabled: true,
    productionSwitchDisabled: true,
    plansReady: false,
    lastAttemptAt: attemptAt,
    lastError: null,
    details: { trigger: options.trigger || 'scheduled' }
  });

  try {
    const token = await accessToken(env);
    const results = [];
    for (const [tier, definition] of Object.entries(tierDefinitions)) {
      results.push(await ensureTier(env, token, tier, definition));
    }
    const finalRows = await planRows(env);
    const ready = rowsReady(finalRows);
    if (!ready) throw new Error('Three active EUR sandbox plans were not present after bootstrap');
    await writeStatus(env, {
      status: 'ready',
      attemptCount,
      configured: true,
      sandboxSwitchEnabled: true,
      productionSwitchDisabled: true,
      productCount: 3,
      planCount: 3,
      plansReady: true,
      lastAttemptAt: attemptAt,
      lastSuccessAt: now(),
      lastError: null,
      details: { trigger: options.trigger || 'scheduled', results }
    });
    return { ok: true, ready: true, plans: results };
  } catch (error) {
    const message = clean(error?.message || error, 900);
    const rows = await planRows(env);
    await writeStatus(env, {
      status: 'failed',
      attemptCount,
      configured: true,
      sandboxSwitchEnabled: true,
      productionSwitchDisabled: true,
      productCount: rows.filter(row => row.provider_product_id).length,
      planCount: rows.length,
      plansReady: false,
      lastAttemptAt: attemptAt,
      lastError: message,
      details: { trigger: options.trigger || 'scheduled' }
    });
    return { ok: false, ready: false, reason: 'sandbox-plan-bootstrap-failed', error: message };
  }
}

async function health(env) {
  if (!hasD1(env)) return json({ ok: false, ready: false, error: 'Membership database unavailable' }, 503);

  let status = await statusRow(env);
  const staleAttempt = !status?.last_attempt_at
    || Date.now() - Date.parse(status.last_attempt_at) > 5 * 60 * 1000;
  if ((!status?.plans_ready || status?.status !== 'ready') && staleAttempt) {
    await ensureSandboxPlans(env, { trigger: 'health-self-heal' });
    status = await statusRow(env);
  }

  const rows = await planRows(env);
  const runtime = await runtimeSetting(env);
  const ready = rowsReady(rows) && Boolean(status?.plans_ready);
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
    if (path === '/api/paypal/bootstrap-health' && request.method === 'GET') return health(env);
    return json({ ok: false, error: 'Sandbox bootstrap route not found' }, 404);
  },

  async scheduled(event, env) {
    await ensureSandboxPlans(env, { trigger: 'cloudflare-cron' });
  }
};
