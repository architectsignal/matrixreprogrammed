import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-paypal-subscriptions.js');
const reportPath = path.join(root, 'downloads', 'paypal-active-subscription-compatibility-test.json');

if (!fs.existsSync(workerPath)) throw new Error('PayPal worker is missing');
const worker = fs.readFileSync(workerPath, 'utf8');
const queryMatch = worker.match(/currentSubscriptionForMember\(env,memberId\)\{return await first\(env\.MEMBERS_DB\.prepare\(`([^`]+)`\)\.bind\(memberId\)\)\}/);
if (!queryMatch) throw new Error('Could not locate the active-subscription compatibility query');
const query = queryMatch[1];

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    provider_subscription_id TEXT,
    provider_plan_id TEXT,
    tier TEXT,
    status TEXT,
    last_payment_at TEXT,
    next_billing_at TEXT,
    current_period_end TEXT,
    cancel_at_period_end INTEGER DEFAULT 0,
    provider TEXT NOT NULL
  );
  CREATE TABLE paypal_subscription_state (
    subscription_id TEXT PRIMARY KEY,
    environment TEXT,
    billing_state TEXT,
    entitlement_active INTEGER,
    payment_failure_count INTEGER DEFAULT 0,
    refund_hold INTEGER DEFAULT 0,
    reversal_hold INTEGER DEFAULT 0,
    last_payment_id TEXT,
    last_payment_amount TEXT,
    currency_code TEXT,
    last_failed_payment_at TEXT,
    last_refund_at TEXT,
    last_reversal_at TEXT,
    last_event_type TEXT,
    last_event_at TEXT,
    updated_at TEXT
  );
  CREATE VIEW paypal_current_subscription_status AS
  SELECT
    s.id AS subscription_id,
    s.member_id,
    s.provider_subscription_id,
    s.provider_plan_id,
    s.tier,
    s.status AS provider_status,
    s.last_payment_at,
    s.next_billing_at,
    s.current_period_end,
    s.cancel_at_period_end,
    p.environment,
    p.billing_state,
    p.entitlement_active,
    p.payment_failure_count,
    p.refund_hold,
    p.reversal_hold,
    p.last_payment_id,
    p.last_payment_amount,
    p.currency_code,
    p.last_failed_payment_at,
    p.last_refund_at,
    p.last_reversal_at,
    p.last_event_type,
    p.last_event_at,
    p.updated_at AS state_updated_at
  FROM subscriptions s
  LEFT JOIN paypal_subscription_state p ON p.subscription_id=s.id
  WHERE s.provider='paypal';
`);

const subscription = db.prepare(`INSERT INTO subscriptions
  (id,member_id,provider_subscription_id,provider_plan_id,tier,status,current_period_end,provider)
  VALUES (?,?,?,?,?,?,?, 'paypal')`);
const state = db.prepare(`INSERT INTO paypal_subscription_state
  (subscription_id,environment,billing_state,entitlement_active,updated_at)
  VALUES (?,?,?,?,?)`);

subscription.run('sub-modern-active','member-modern-active','P-MODERN-A','PLAN-I','intelligence','ACTIVE','2099-01-01T00:00:00Z');
state.run('sub-modern-active','live','active',1,'2026-07-22T00:00:00Z');

subscription.run('sub-legacy-active','member-legacy-active','P-LEGACY-A','PLAN-S','supporter','ACTIVE','2099-01-01T00:00:00Z');
subscription.run('sub-legacy-trial','member-legacy-trial','P-LEGACY-T','PLAN-S','supporter','TRIALING',null);
subscription.run('sub-legacy-expired','member-legacy-expired','P-LEGACY-E','PLAN-S','supporter','ACTIVE','2001-01-01T00:00:00Z');

subscription.run('sub-modern-cancelled','member-modern-cancelled','P-MODERN-C','PLAN-I','intelligence','ACTIVE','2099-01-01T00:00:00Z');
state.run('sub-modern-cancelled','live','cancelled',0,'2026-07-22T00:00:00Z');

const statement = db.prepare(query);
const cases = [
  ['modern active', 'member-modern-active', 1],
  ['legacy active', 'member-legacy-active', 1],
  ['legacy trialing', 'member-legacy-trial', 1],
  ['legacy expired', 'member-legacy-expired', 0],
  ['modern cancelled', 'member-modern-cancelled', 0]
];
const results = cases.map(([name, memberId, expected]) => {
  const row = statement.get(memberId);
  const actual = Number(row?.paid_access || 0);
  return { name, memberId, expected, actual, ok: actual === expected, row: row || null };
});

const failures = results.filter(result => !result.ok);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  query,
  results,
  failures: failures.map(result => result.name),
  policy: 'Modern entitlement state is authoritative; legacy ACTIVE or TRIALING records remain protected only while their paid period has not expired.'
}, null, 2));

db.close();
if (failures.length) {
  throw new Error(`PayPal active-subscription compatibility failed: ${failures.map(item => `${item.name} expected ${item.expected} got ${item.actual}`).join('; ')}`);
}
console.log(`PayPal active-subscription compatibility passed: ${results.length} modern and legacy cases.`);
