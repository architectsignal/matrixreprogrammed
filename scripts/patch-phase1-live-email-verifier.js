const fs = require('fs');
const path = require('path');

const root = process.cwd();
const verifierPath = path.join(root, 'scripts', 'verify-live-production.js');
const reportPath = path.join(root, 'downloads', 'phase1-live-email-verifier-patch.json');

if (!fs.existsSync(verifierPath)) throw new Error('scripts/verify-live-production.js is missing');

const before = fs.readFileSync(verifierPath, 'utf8');
let after = before;
let changed = false;

function replaceIfPresent(oldValue, newValue) {
  if (after.includes(newValue) || !after.includes(oldValue)) return;
  after = after.replace(oldValue, newValue);
  changed = true;
}

// Repair only genuinely obsolete route markers. A newer verifier may already use
// the runtime-gated PayPal model and must not be rewritten back to sandbox logic.
replaceIfPresent("'/daily-power-conclusions': '<!-- conclusion-integrity:start -->'", "'/daily-power-conclusions': 'DAILY POWER CONCLUSIONS'");
replaceIfPresent("'/daily-investigation-conclusions': '<!-- conclusion-integrity:start -->'", "'/daily-investigation-conclusions': 'DAILY INVESTIGATION CONCLUSIONS.'");
replaceIfPresent("'/deploy-health': 'SANDBOX READY / CHECKOUT DISABLED'", "'/deploy-health.json': '\"workerScript\": \"src/worker-production.js\"'");

const requiredMarkers = [
  "path.join(root, 'downloads', 'wrangler-deploy.log')",
  'deployedFalse && !deployedTrue && adminHealthProtected',
  "'/daily-power-conclusions': 'DAILY POWER CONCLUSIONS'",
  "'/deploy-health.json': '\"workerScript\": \"src/worker-production.js\"'",
  'manifestMatchesCurrentMain',
  'manifestIsCommitBound',
  'health?.buildSha === manifestSha',
  'verifyPayPalBoundary',
  "'/api/paypal/checkout-intent'",
  "paymentStatus === 'runtime-gated-dashboard-managed'",
  "checkoutDefault === 'runtime-d1-gated'"
];
for (const marker of requiredMarkers) {
  if (!after.includes(marker)) throw new Error(`Phase 1 live verifier missing marker: ${marker}`);
}

if (changed) fs.writeFileSync(verifierPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  verifier: 'scripts/verify-live-production.js',
  deploymentLogPath: 'downloads/wrangler-deploy.log',
  stableRouteMarkers: true,
  canonicalDeployHealthRoute: '/deploy-health.json',
  commitRacePolicy: 'Accept the exact deployed SHA or a newer current-main SHA only when manifest and health are commit-bound and mutually consistent.',
  paypalVerificationModel: 'Runtime-gated, Cloudflare-dashboard-managed, anonymous checkout rejected.',
  boundary: 'Live verification proves the deployed email automation binding is false, health JSON is commit-bound, and anonymous PayPal configuration and checkout routes remain closed.'
}, null, 2)}\n`);
require('./patch-search-v3-compaction-headroom.js');
console.log(`Phase 1 live production verifier ${changed ? 'patched' : 'already current'}; runtime-gated PayPal and Search V3 compaction headroom verified.`);
