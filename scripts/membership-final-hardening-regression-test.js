const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputPath = path.join(root, 'downloads', 'membership-final-hardening-regression-test.json');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-membership-hardening-'));
const checks = [];
const failures = [];

function record(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push(detail ? `${name}: ${detail}` : name);
}

function sourcePath(relative) {
  return path.join(root, relative);
}

function tempPath(relative) {
  return path.join(tempRoot, relative);
}

function copy(relative) {
  const source = sourcePath(relative);
  if (!fs.existsSync(source) || fs.statSync(source).isDirectory()) {
    throw new Error(`Regression fixture source is missing: ${relative}`);
  }
  const destination = tempPath(relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function read(relative) {
  return fs.readFileSync(tempPath(relative), 'utf8');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedNewlines(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function runHardener() {
  const result = spawnSync(process.execPath, [tempPath('scripts/harden-worker-api-contracts.js')], {
    cwd: tempRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

let firstRun = null;
let secondRun = null;
let firstReport = null;
let secondReport = null;

try {
  for (const relative of [
    'scripts/harden-worker-api-contracts.js',
    'templates/phase6-membership.template',
    'src/worker-paypal-subscriptions.js',
    'src/worker.js',
    'src/worker-production.js',
    'membership.html',
    'paypal-membership.js'
  ]) copy(relative);

  const membershipTemplateRelative = 'templates/phase6-membership.template';
  const canonicalMembership = read(membershipTemplateRelative);
  const canonicalPayPalClient = read('paypal-membership.js');
  const canonicalMembershipHash = hash(canonicalMembership);
  const canonicalPayPalHash = hash(canonicalPayPalClient);

  // Reproduce the real full-build failure: a late owner has already replaced the
  // root membership page and deploy copies before API hardening runs. The protected
  // Phase 6 template remains correct and must be able to repair every public mirror.
  fs.writeFileSync(
    tempPath('membership.html'),
    '<!doctype html><title>Mutated root membership output</title><p>Coming soon — no payment taken</p><script src="https://www.paypal.com/sdk/js"></script>\n'
  );
  fs.mkdirSync(tempPath('_site'), { recursive: true });
  fs.writeFileSync(
    tempPath('_site/membership.html'),
    '<!doctype html><title>Retired membership output</title><p>Coming soon — no payment taken</p><script src="https://www.paypal.com/sdk/js"></script>\n'
  );
  fs.writeFileSync(
    tempPath('_site/membership'),
    '<!doctype html><title>Stale extensionless membership output</title><p>Coming soon — no payment taken</p>\n'
  );
  fs.writeFileSync(
    tempPath('_site/paypal-membership.js'),
    'window.paypal = {}; function loadSdk() { return true; }\n'
  );

  firstRun = runHardener();
  record('first hardening run exits successfully', firstRun.status === 0, firstRun.stderr || firstRun.stdout);

  firstReport = JSON.parse(read('downloads/worker-api-contract-hardening.json'));
  const firstChanged = new Set(firstReport.changed || []);
  for (const relative of ['membership.html', '_site/membership.html', '_site/membership', '_site/paypal-membership.js']) {
    record(`${relative} repaired on first run`, firstChanged.has(relative), JSON.stringify(firstReport.changed || []));
  }

  record('protected Phase 6 membership template remains byte-identical', hash(read(membershipTemplateRelative)) === canonicalMembershipHash);
  record('root membership repaired from protected Phase 6 template', normalizedNewlines(read('membership.html')) === normalizedNewlines(canonicalMembership));
  record('canonical PayPal client remains byte-identical', hash(read('paypal-membership.js')) === canonicalPayPalHash);
  record('_site membership HTML matches protected template', normalizedNewlines(read('_site/membership.html')) === normalizedNewlines(canonicalMembership));
  record('_site extensionless membership matches protected template', normalizedNewlines(read('_site/membership')) === normalizedNewlines(canonicalMembership));
  record('_site PayPal client matches canonical source', normalizedNewlines(read('_site/paypal-membership.js')) === normalizedNewlines(canonicalPayPalClient));

  for (const marker of [
    'id="join-free-member"', 'data-tier-price="0"',
    'id="join-supporter"', 'data-tier-price="3"',
    'id="join-intelligence-member"', 'data-tier-price="6"',
    'id="join-research-pro"', 'data-tier-price="9"',
    'paypal-membership.js',
    'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.'
  ]) {
    record(`membership structural marker preserved: ${marker}`, read('membership.html').includes(marker));
  }
  record('retired placeholder copy removed from root and deploy output', !read('membership.html').includes('Coming soon — no payment taken') && !read('_site/membership.html').includes('Coming soon — no payment taken'));
  record('server-created subscription route preserved', read('_site/paypal-membership.js').includes('/api/paypal/subscription/create'));
  record('secure redirect action preserved', read('_site/paypal-membership.js').includes('Continue securely to PayPal') && read('_site/paypal-membership.js').includes('location.assign'));
  record('browser PayPal SDK remains absent', !read('_site/paypal-membership.js').includes('paypal.com/sdk/js') && !read('_site/paypal-membership.js').includes('window.paypal') && !read('_site/paypal-membership.js').includes('loadSdk('));

  const firstState = {
    membershipRoot: hash(read('membership.html')),
    membershipHtml: hash(read('_site/membership.html')),
    membershipExtensionless: hash(read('_site/membership')),
    paypalClient: hash(read('_site/paypal-membership.js'))
  };

  secondRun = runHardener();
  record('second hardening run exits successfully', secondRun.status === 0, secondRun.stderr || secondRun.stdout);
  secondReport = JSON.parse(read('downloads/worker-api-contract-hardening.json'));
  record('second hardening run is idempotent', Array.isArray(secondReport.changed) && secondReport.changed.length === 0, JSON.stringify(secondReport.changed || []));
  record('root membership remains stable on second run', hash(read('membership.html')) === firstState.membershipRoot);
  record('membership HTML remains stable on second run', hash(read('_site/membership.html')) === firstState.membershipHtml);
  record('extensionless membership remains stable on second run', hash(read('_site/membership')) === firstState.membershipExtensionless);
  record('PayPal client remains stable on second run', hash(read('_site/paypal-membership.js')) === firstState.paypalClient);
} catch (error) {
  failures.push(String(error && error.stack ? error.stack : error));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  firstRun: firstRun ? { status: firstRun.status, stdout: firstRun.stdout.slice(-1500), stderr: firstRun.stderr.slice(-1500) } : null,
  secondRun: secondRun ? { status: secondRun.status, stdout: secondRun.stdout.slice(-1500), stderr: secondRun.stderr.slice(-1500) } : null,
  firstChanged: firstReport?.changed || [],
  secondChanged: secondReport?.changed || [],
  boundary: 'This regression test operates only in an isolated temporary directory. It uses no credentials, calls no provider, mutates no production data and performs no deployment.'
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('MEMBERSHIP FINAL HARDENING REGRESSION FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`MEMBERSHIP FINAL HARDENING REGRESSION PASSED: ${checks.length} checks; protected Phase 6 template, root source, HTML, extensionless and PayPal client mirrors remain canonical and idempotent.`);
