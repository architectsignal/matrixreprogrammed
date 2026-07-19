const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-paypal-subscriptions.js');
const clientPath = path.join(root, 'paypal-membership.js');
const siteClientPath = path.join(root, '_site', 'paypal-membership.js');
const reportPath = path.join(root, 'downloads', 'paypal-subscription-create-state-repair.json');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function writeIfChanged(file, source) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (before === source) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return true;
}

let worker = read(workerPath);
let client = read(clientPath);
const changed = [];

worker = worker.replace(
  "(created.links||[]).find(link=>link.rel==='approve'&&link.method==='GET')?.href||''",
  "(created.links||[]).find(link=>link.rel==='approve')?.href||''"
);
worker = worker.replace(
  "UPDATE paypal_checkout_intent_state SET status='approval_pending',provider_subscription_id=?,updated_at=? WHERE checkout_intent_id=?",
  "UPDATE paypal_checkout_intent_state SET status='created',provider_subscription_id=?,updated_at=? WHERE checkout_intent_id=?"
);
worker = worker.replace(
  "UPDATE paypal_checkout_intent_state SET status='provider_create_failed',updated_at=? WHERE checkout_intent_id=?\").bind(now(),intent.intentId)",
  "UPDATE paypal_checkout_intent_state SET status='failed',failed_at=?,failure_reason=?,updated_at=? WHERE checkout_intent_id=?\").bind(now(),clean(error.message||error,500),now(),intent.intentId)"
);

client = client.replace(
  "throw new Error(data.error||data.message||'Payment request failed')",
  "throw new Error(data.message||data.error||'Payment request failed')"
);

if (writeIfChanged(workerPath, worker)) changed.push('src/worker-paypal-subscriptions.js');
if (writeIfChanged(clientPath, client)) changed.push('paypal-membership.js');
if (fs.existsSync(path.dirname(siteClientPath)) && writeIfChanged(siteClientPath, client)) changed.push('_site/paypal-membership.js');

const finalWorker = read(workerPath);
const finalClient = read(clientPath);
const forbidden = ["status='approval_pending'", "status='provider_create_failed'"];
for (const marker of forbidden) {
  if (finalWorker.includes(marker)) throw new Error(`Invalid D1 PayPal checkout state remains: ${marker}`);
}
for (const marker of [
  "status='created',provider_subscription_id=?",
  "status='failed',failed_at=?,failure_reason=?,updated_at=?",
  ".find(link=>link.rel==='approve')",
  "data.message||data.error"
]) {
  if (!finalWorker.includes(marker) && !finalClient.includes(marker)) throw new Error(`PayPal create-state repair marker missing: ${marker}`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  checkoutState: 'created until provider approval',
  failureState: 'failed with failed_at and failure_reason',
  approvalLinkPolicy: 'accept the PayPal rel=approve link regardless of optional method casing',
  clientErrorPolicy: 'show the specific Worker or PayPal message before the generic fail-safe label',
  schemaCompatibility: 'Uses only statuses allowed by phase6_paypal_subscriptions.sql.'
}, null, 2)}\n`);
console.log('PayPal subscription creation repaired: D1-compatible states, provider detail visibility and robust approval-link selection installed.');
