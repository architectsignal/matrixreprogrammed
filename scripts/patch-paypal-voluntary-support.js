const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-paypal-subscriptions.js');
const reportPath = path.join(root, 'downloads', 'paypal-voluntary-support-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-paypal-subscriptions.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

// Keep this patch route-order independent. New subscription routes may be added
// before or after the voluntary-support routes, so never compare the full registry.
for (const route of [
  '/api/paypal/donation/config',
  '/api/paypal/donation/order',
  '/api/paypal/donation/capture'
]) {
  if (source.includes(`'${route}'`)) continue;
  const anchor = "'/api/paypal/webhook'";
  if (!source.includes(anchor)) throw new Error(`PayPal route registry insertion anchor missing for ${route}`);
  source = source.replace(anchor, `'${route}',${anchor}`);
  changed = true;
}

for (const [from, to] of [
  ['parsed>500', 'parsed>5000'],
  ["maxAmount:'500.00'", "maxAmount:'5000.00'"],
  ['€500.00', '€5,000.00']
]) {
  if (source.includes(from)) {
    source = source.replaceAll(from, to);
    changed = true;
  }
}

// Donation functions are part of the canonical Worker. Refuse to silently invent
// payment code when they are absent; this keeps the build fail-closed.
for (const marker of [
  'function donationAmount(value)',
  'async function donationConfig(request,env)',
  'async function createDonationOrder(request,env)',
  'async function captureDonationOrder(request,env)'
]) {
  if (!source.includes(marker)) throw new Error(`Voluntary support function missing: ${marker}`);
}

const webhookHandler = "if(path==='/api/paypal/webhook'&&request.method==='POST')return webhook(request,env);";
const donationHandlers = "if(path==='/api/paypal/donation/config'&&request.method==='GET')return donationConfig(request,env);if(path==='/api/paypal/donation/order'&&request.method==='POST')return createDonationOrder(request,env);if(path==='/api/paypal/donation/capture'&&request.method==='POST')return captureDonationOrder(request,env);";
if (!source.includes(donationHandlers)) {
  if (!source.includes(webhookHandler)) throw new Error('PayPal route handler insertion anchor not found');
  source = source.replace(webhookHandler, `${donationHandlers}${webhookHandler}`);
  changed = true;
}

for (const marker of [
  '/api/paypal/donation/config',
  '/api/paypal/donation/order',
  '/api/paypal/donation/capture',
  'function donationAmount(value)',
  'parsed>5000',
  "maxAmount:'5000.00'",
  'PAYPAL_DONATIONS_ENABLED',
  'not a charitable or tax-deductible donation',
  'payment_type,status,gross_amount',
  'paypal.donation.captured'
]) {
  if (!source.includes(marker)) throw new Error(`Voluntary support worker marker missing: ${marker}`);
}

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  routeRegistryPolicy: 'order-independent; preserves server-created subscription routes',
  routes: ['/api/paypal/donation/config','/api/paypal/donation/order','/api/paypal/donation/capture'],
  amount: { currency: 'EUR', minimum: '1.00', maximum: '5000.00', userChosen: true },
  requiresMemberLogin: true,
  evidenceAccessRemainsFree: true,
  legalBoundary: 'Voluntary support payment; not charitable or tax-deductible; no influence over evidence or conclusions.',
  activationBoundary: 'Sandbox or fully confirmed live PayPal environment plus PAYPAL_DONATIONS_ENABLED.'
}, null, 2)}\n`);
console.log(`PayPal voluntary support flow ${changed ? 'updated' : 'already current'}; server-created subscription routes preserved.`);
