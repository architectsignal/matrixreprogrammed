import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = String(sql); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.includes('FROM paypal_runtime_settings')) {
      return { environment: 'sandbox', checkout_enabled: this.db.checkoutEnabled ? 1 : 0, activation_reason: 'test', updated_at: new Date().toISOString() };
    }
    if (this.sql.includes('FROM paypal_sandbox_rehearsal_runs') && this.sql.includes("status='active'")) return this.db.activeRun || null;
    return null;
  }
  async all() {
    if (this.sql.includes('datetime(expires_at)<=datetime')) return { results: [] };
    return { results: [] };
  }
  async run() {
    if (this.sql.includes('UPDATE paypal_runtime_settings SET checkout_enabled=0')) this.db.checkoutEnabled = false;
    return { success: true };
  }
}
class FakeD1 {
  constructor({ checkoutEnabled = false, activeRun = null } = {}) { this.checkoutEnabled = checkoutEnabled; this.activeRun = activeRun; }
  prepare(sql) { return new FakeStatement(this, sql); }
}

const migration = read('migrations/phase7_paypal_sandbox_rehearsal.sql');
const worker = read('src/worker-paypal-sandbox-rehearsal.js');
const production = read('src/worker-production.js');
const wranglerToml = read('wrangler.toml');
const wranglerJsonc = read('wrangler.jsonc');
const adminPage = read('admin-paypal-rehearsal.html');
const adminRuntime = read('admin-paypal-rehearsal.js');
const deploy = read('.github/workflows/deploy.yml');
const packageJson = read('package.json');

for (const marker of [
  'CREATE TABLE IF NOT EXISTS paypal_sandbox_rehearsal_runs',
  'CREATE TABLE IF NOT EXISTS paypal_sandbox_rehearsal_evidence',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_paypal_sandbox_one_active',
  'CREATE VIEW paypal_active_sandbox_rehearsal',
  'CREATE VIEW paypal_sandbox_rehearsal_summary',
  'SET checkout_enabled=0'
]) check(`migration contains ${marker}`, migration.includes(marker));

for (const marker of [
  'cloudflare-worker-paypal-sandbox-rehearsal',
  'START MATRIX PAYPAL SANDBOX REHEARSAL',
  'COMPLETE MATRIX PAYPAL SANDBOX REHEARSAL',
  'ABORT MATRIX PAYPAL SANDBOX REHEARSAL',
  'Math.min(45',
  'activeEntitlementObserved',
  'verifiedWebhookObserved',
  'paymentCount',
  'cancellationObserved',
  'expireStaleRuns',
  'closeOrphanedCheckout',
  'liveChargingEnabled: false'
]) check(`Worker contains ${marker}`, worker.includes(marker));

check('production boundary imports rehearsal Worker', production.includes("from './worker-paypal-sandbox-rehearsal.js'"));
check('production boundary checks rehearsal route origin', production.includes('non-authoritative-paypal-rehearsal-response-blocked'));
check('production boundary gates all subscription starts', production.includes("'/api/paypal/subscription/create'") && production.includes('enforceSandboxRehearsalGate'));
check('production boundary schedules automatic closure', production.includes('rehearsalWorker.scheduled'));

check('Wrangler preserves dashboard runtime variables', /^keep_vars\s*=\s*true\s*$/m.test(wranglerToml) && /"keep_vars"\s*:\s*true/.test(wranglerJsonc));
check('Wrangler has no active PayPal TOML overrides', !/^\s*PAYPAL_[A-Z0-9_]+\s*=/m.test(wranglerToml));
check('Wrangler has no active PayPal JSONC overrides', !/^\s*"PAYPAL_[A-Z0-9_]+"\s*:/m.test(wranglerJsonc));

for (const marker of ['PAYPAL SANDBOX REHEARSAL.', 'maximum 45-minute window', 'admin-paypal-rehearsal.js', 'Complete and close checkout', 'Abort and close checkout']) check(`admin page contains ${marker}`, adminPage.includes(marker));
for (const marker of ['/api/paypal/admin/rehearsal/readiness','/api/paypal/admin/rehearsal/start','/api/paypal/admin/rehearsal/status','/api/paypal/admin/rehearsal/complete','/api/paypal/admin/rehearsal/abort']) check(`admin runtime calls ${marker}`, adminRuntime.includes(marker));

const hardFreeze = /HARD FREEZE|PRODUCTION DEPLOYMENT LOCKED/i.test(deploy);
const executableDeployCommand = /^\s*(?:-\s*)?(?:run:\s*)?(?:npx\s+)?wrangler(?:@latest)?\s+(?:deploy|pages\s+deploy)\b/im;
if (hardFreeze) {
  check('canonical production deployment is explicitly hard frozen', /HARD FREEZE/i.test(deploy) && /PRODUCTION DEPLOYMENT LOCKED/i.test(deploy));
  check('hard freeze contains no executable Wrangler deployment command', !executableDeployCommand.test(deploy));
  check('Phase 7 rehearsal assets remain build-tested while deployment is frozen', packageJson.includes('phase7-paypal-sandbox-rehearsal-test.mjs') && migration.length > 0 && worker.length > 0);
  check('hard freeze preserves live state by performing no migration or checkout mutation', !deploy.includes('migrations/phase7_paypal_sandbox_rehearsal.sql') && !/checkout_enabled\s*=|d1 execute|migrations apply/i.test(deploy));
} else {
  check('canonical deployment applies Phase 7 migration', deploy.includes('migrations/phase7_paypal_sandbox_rehearsal.sql'));
  check('canonical deployment syntax-checks rehearsal Worker', deploy.includes('node --check src/worker-paypal-sandbox-rehearsal.js'));
  check('canonical deployment runs Phase 7 test', deploy.includes('node scripts/phase7-paypal-sandbox-rehearsal-test.mjs'));
  check('canonical deployment closes sandbox while preserving live state', deploy.includes('Sandbox checkout must remain closed outside an explicit rehearsal') && deploy.includes('live checkout state preserved'));
}

try {
  const module = await import(pathToFileURL(path.join(root, 'src/worker-paypal-sandbox-rehearsal.js')).href + `?test=${Date.now()}`);
  const closed = await module.enforceSandboxRehearsalGate({
    MEMBERS_DB: new FakeD1({ checkoutEnabled: false }),
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_SANDBOX_ENABLED: 'true',
    PAYPAL_PRODUCTION_ENABLED: 'false'
  });
  check('sandbox gate remains closed without active run', closed.allowed === false && closed.reason === 'sandbox-checkout-requires-active-rehearsal', JSON.stringify(closed));

  const activeRun = { id: 'paypal-sandbox-rehearsal-test', status: 'active', expires_at: new Date(Date.now() + 15 * 60000).toISOString() };
  const open = await module.enforceSandboxRehearsalGate({
    MEMBERS_DB: new FakeD1({ checkoutEnabled: true, activeRun }),
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_SANDBOX_ENABLED: 'true',
    PAYPAL_PRODUCTION_ENABLED: 'false'
  });
  check('sandbox gate opens only for active timed run', open.allowed === true && open.run?.id === activeRun.id, JSON.stringify(open));

  const live = await module.enforceSandboxRehearsalGate({
    MEMBERS_DB: new FakeD1({ checkoutEnabled: true }),
    PAYPAL_ENVIRONMENT: 'live',
    PAYPAL_SANDBOX_ENABLED: 'false',
    PAYPAL_PRODUCTION_ENABLED: 'true'
  });
  check('sandbox rehearsal gate does not control live routing', live.allowed === true && live.reason === 'not-sandbox', JSON.stringify(live));
} catch (error) {
  failures.push(`runtime import or gate execution failed: ${error.stack || error.message}`);
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  phase: 7,
  name: 'PayPal sandbox rehearsal',
  deploymentMode: hardFreeze ? 'hard-freeze' : 'deployment-enabled',
  checks,
  failures,
  safetyBoundary: hardFreeze
    ? 'Production deployment is hard frozen. Rehearsal code and migration remain validated in Git; sandbox checkout stays closed and no workflow may mutate live or sandbox state.'
    : 'Sandbox checkout is allowed only during an active timed rehearsal. Cloudflare owns the current environment and credentials; deployment keeps sandbox closed and preserves the independently authorized live D1 switch.'
};

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'phase7-paypal-sandbox-rehearsal-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('\nPHASE 7 PAYPAL SANDBOX REHEARSAL TEST FAILED\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PHASE 7 PAYPAL SANDBOX REHEARSAL TEST PASSED (${checks.length} checks; ${report.deploymentMode})`);
