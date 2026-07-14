import fs from 'node:fs';
import path from 'node:path';
import bootstrapWorker, { ensureSandboxPlans } from '../src/worker-paypal-sandbox-bootstrap-v2.js';

const root = process.cwd();
const output = path.join(root, 'downloads', 'phase8-autonomous-sandbox-readiness-test.json');
const failures = [];
const checks = [];
const check = (name, condition, details = {}) => {
  checks.push({ name, passed: Boolean(condition), ...details });
  if (!condition) failures.push(name);
};

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const { db, sql, args } = this;
    if (sql.includes('FROM paypal_sandbox_bootstrap_status')) return db.status ? { ...db.status } : null;
    if (sql.includes('FROM paypal_runtime_settings')) return { ...db.runtime };
    if (sql.includes('FROM paypal_products') && sql.includes('tier=?')) return db.products.get(args[0]) ? { ...db.products.get(args[0]) } : null;
    if (sql.includes('FROM paypal_plans') && sql.includes('tier=?')) return db.plans.get(args[0]) ? { ...db.plans.get(args[0]) } : null;
    throw new Error(`Unhandled first SQL: ${sql}`);
  }
  async all() {
    const { db, sql } = this;
    if (sql.includes('FROM paypal_plans') && sql.includes("environment='sandbox'")) {
      return { results: ['supporter', 'intelligence', 'research_pro'].map(tier => db.plans.get(tier)).filter(Boolean).map(row => ({ ...row })) };
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }
  async run() {
    const { db, sql, args } = this;
    if (sql.startsWith('INSERT INTO paypal_sandbox_bootstrap_status')) {
      const previousCreated = db.status?.created_at;
      db.status = {
        environment: 'sandbox', status: args[0], attempt_count: args[1], configured: args[2],
        sandbox_switch_enabled: args[3], production_switch_disabled: args[4], product_count: args[5],
        plan_count: args[6], plans_ready: args[7], last_attempt_at: args[8], last_success_at: args[9],
        last_error: args[10], details_json: args[11], updated_at: args[12], created_at: previousCreated || args[13]
      };
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO paypal_products')) {
      db.products.set(args[1], {
        id: args[0], environment: 'sandbox', tier: args[1], provider_product_id: args[2],
        name: args[3], description: args[4], status: 'active', created_at: args[5], updated_at: args[6]
      });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO paypal_plans')) {
      db.plans.set(args[1], {
        id: args[0], environment: 'sandbox', tier: args[1], provider_product_id: args[2],
        provider_plan_id: args[3], amount_value: args[4], currency_code: 'EUR', interval_unit: 'MONTH',
        interval_count: 1, status: args[5], payment_failure_threshold: 2, created_at: args[6], updated_at: args[7]
      });
      return { success: true };
    }
    throw new Error(`Unhandled run SQL: ${sql}`);
  }
}

class FakeDB {
  constructor() {
    this.status = null;
    this.products = new Map();
    this.plans = new Map();
    this.runtime = { checkout_enabled: 0, activation_reason: 'closed for rehearsal only', updated_at: new Date().toISOString() };
  }
  prepare(sql) { return new FakeStatement(this, sql); }
}

const remotePlans = new Map();
const fetchCalls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  fetchCalls.push({ url: parsed.pathname, method: options.method || 'GET' });
  if (parsed.pathname === '/v1/oauth2/token') {
    return new Response(JSON.stringify({ access_token: 'sandbox-token' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (parsed.pathname === '/v1/catalogs/products' && options.method === 'POST') {
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: `PROD-${body.name.replace(/\W+/g, '-').toUpperCase()}`, ...body }), { status: 201 });
  }
  if (parsed.pathname === '/v1/billing/plans' && options.method === 'POST') {
    const body = JSON.parse(options.body);
    const id = `PLAN-${body.name.replace(/\W+/g, '-').toUpperCase()}`;
    const plan = { id, ...body, status: 'ACTIVE' };
    remotePlans.set(id, plan);
    return new Response(JSON.stringify(plan), { status: 201 });
  }
  const planMatch = parsed.pathname.match(/^\/v1\/billing\/plans\/([^/]+)$/);
  if (planMatch && (!options.method || options.method === 'GET')) {
    const plan = remotePlans.get(decodeURIComponent(planMatch[1]));
    return new Response(JSON.stringify(plan || { name: 'RESOURCE_NOT_FOUND' }), { status: plan ? 200 : 404 });
  }
  const activateMatch = parsed.pathname.match(/^\/v1\/billing\/plans\/([^/]+)\/activate$/);
  if (activateMatch && options.method === 'POST') {
    const id = decodeURIComponent(activateMatch[1]);
    const plan = remotePlans.get(id);
    if (plan) plan.status = 'ACTIVE';
    return new Response('', { status: 204 });
  }
  return new Response(JSON.stringify({ error: 'unhandled mock route', path: parsed.pathname }), { status: 500 });
};

try {
  const db = new FakeDB();
  const env = {
    MEMBERS_DB: db,
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_SANDBOX_ENABLED: 'true',
    PAYPAL_PRODUCTION_ENABLED: 'false',
    PAYPAL_CLIENT_ID: 'sandbox-client',
    PAYPAL_CLIENT_SECRET: 'sandbox-secret',
    PAYPAL_WEBHOOK_ID: 'sandbox-webhook'
  };

  const first = await ensureSandboxPlans(env, { trigger: 'test-first-run' });
  check('first run creates and verifies plans', first.ok && first.ready);
  check('three products persisted', db.products.size === 3, { count: db.products.size });
  check('three plans persisted', db.plans.size === 3, { count: db.plans.size });
  check('prices locked to €3/€6/€9',
    db.plans.get('supporter')?.amount_value === '3.00'
    && db.plans.get('intelligence')?.amount_value === '6.00'
    && db.plans.get('research_pro')?.amount_value === '9.00');
  check('all plans active in EUR', [...db.plans.values()].every(row => row.status === 'ACTIVE' && row.currency_code === 'EUR'));
  check('bootstrap never enables checkout', db.runtime.checkout_enabled === 0);
  check('production switch remains disabled', env.PAYPAL_PRODUCTION_ENABLED === 'false');
  check('bootstrap ledger ready', db.status?.status === 'ready' && db.status?.plans_ready === 1 && db.status?.last_success_at);

  const callsAfterFirst = fetchCalls.length;
  const second = await ensureSandboxPlans(env, { trigger: 'test-second-run' });
  check('second run is idempotent', second.ok && second.ready && second.source === 'verified-d1');
  check('second run makes no PayPal calls', fetchCalls.length === callsAfterFirst, { firstCalls: callsAfterFirst, secondCalls: fetchCalls.length });

  const healthResponse = await bootstrapWorker.fetch(new Request('https://matrixreprogrammed.com/api/paypal/bootstrap-health'), env);
  const health = await healthResponse.json();
  check('public bootstrap health is ready', healthResponse.status === 200 && health.ok === true && health.plansReady === true);
  check('public health exposes no provider IDs', !JSON.stringify(health).includes('PROD-') && !JSON.stringify(health).includes('PLAN-'));
  check('public health confirms live charging disabled', health.liveChargingEnabled === false);
  check('public health confirms checkout still closed', health.databaseCheckoutEnabled === false);

  const blockedDb = new FakeDB();
  const blockedCallsBefore = fetchCalls.length;
  const blocked = await ensureSandboxPlans({ ...env, MEMBERS_DB: blockedDb, PAYPAL_PRODUCTION_ENABLED: 'true' }, { trigger: 'unsafe-test' });
  check('production-enabled configuration blocks sandbox bootstrap', blocked.ok === false && blocked.reason === 'sandbox-bootstrap-safety-check-failed');
  check('blocked configuration makes no PayPal calls', fetchCalls.length === blockedCallsBefore);
  check('blocked configuration keeps checkout closed', blockedDb.runtime.checkout_enabled === 0);

  const migration = fs.readFileSync(path.join(root, 'migrations/phase8_paypal_sandbox_bootstrap.sql'), 'utf8');
  const wrangler = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  const production = fs.readFileSync(path.join(root, 'src/worker-production.js'), 'utf8');
  check('Phase 8 migration defines status table and health view', migration.includes('paypal_sandbox_bootstrap_status') && migration.includes('paypal_sandbox_bootstrap_health'));
  check('Cloudflare hourly cron configured', wrangler.includes('crons = ["0 * * * *"]'));
  check('strict production boundary validates bootstrap origin', production.includes('cloudflare-worker-paypal-sandbox-bootstrap') && production.includes('non-authoritative-paypal-bootstrap-response-blocked'));
  check('scheduled handler runs bootstrap and rehearsal safety', production.includes('bootstrapWorker.scheduled') && production.includes('rehearsalWorker.scheduled'));
} finally {
  globalThis.fetch = originalFetch;
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checksPassed: checks.filter(item => item.passed).length,
  checksRequired: checks.length,
  checks,
  failures,
  paypalCalls: fetchCalls,
  realPayPalCalls: false,
  realCharges: false,
  checkoutActivation: false,
  liveChargingEnabled: false,
  boundary: 'Phase 8 may create or verify sandbox products and plans only. It cannot enable checkout and cannot access live PayPal.'
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2));
if (failures.length) {
  failures.forEach(item => console.error(`PHASE 8 FAILURE: ${item}`));
  process.exit(1);
}
console.log(`PHASE 8 PASS: ${report.checksPassed}/${report.checksRequired} autonomous sandbox readiness checks.`);
