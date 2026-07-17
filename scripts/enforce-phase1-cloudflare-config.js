const fs = require('fs');
const path = require('path');

const root = process.cwd();
const configPath = path.join(root, 'wrangler.toml');
const reportPath = path.join(root, 'downloads', 'phase1-cloudflare-config-enforcement.json');

if (!fs.existsSync(configPath)) throw new Error('wrangler.toml is missing');
const before = fs.readFileSync(configPath, 'utf8');
let after = before;

if (/^keep_vars\s*=\s*(?:true|false)\s*$/m.test(after)) {
  after = after.replace(/^keep_vars\s*=\s*(?:true|false)\s*$/m, 'keep_vars = false');
} else {
  const compatibilityLine = /^compatibility_date\s*=.*$/m;
  if (!compatibilityLine.test(after)) throw new Error('wrangler.toml compatibility_date anchor is missing');
  after = after.replace(compatibilityLine, match => `${match}\nkeep_vars = false`);
}

if (/^EMAIL_AUTOMATION_ENABLED\s*=\s*"(?:true|false)"\s*$/m.test(after)) {
  after = after.replace(/^EMAIL_AUTOMATION_ENABLED\s*=\s*"(?:true|false)"\s*$/m, 'EMAIL_AUTOMATION_ENABLED = "false"');
} else {
  const varsAnchor = /^\[vars\]\s*$/m;
  if (!varsAnchor.test(after)) throw new Error('wrangler.toml [vars] section is missing');
  after = after.replace(varsAnchor, match => `${match}\nEMAIL_AUTOMATION_ENABLED = "false"`);
}

const failures = [];
if (!/^keep_vars\s*=\s*false\s*$/m.test(after)) failures.push('keep_vars must be false');
if (!/^EMAIL_AUTOMATION_ENABLED\s*=\s*"false"\s*$/m.test(after)) failures.push('EMAIL_AUTOMATION_ENABLED must be false');
if (/^EMAIL_AUTOMATION_ENABLED\s*=\s*"true"\s*$/m.test(after)) failures.push('EMAIL_AUTOMATION_ENABLED=true remains');
if (!/^PAYPAL_ENVIRONMENT\s*=\s*"sandbox"\s*$/m.test(after)) failures.push('PayPal environment must remain sandbox');
if (!/^PAYPAL_PRODUCTION_ENABLED\s*=\s*"false"\s*$/m.test(after)) failures.push('PayPal production must remain disabled');

if (!failures.length && after !== before) fs.writeFileSync(configPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed: after !== before,
  sourceOfTruth: 'wrangler.toml',
  keepVars: false,
  emailAutomationEnabled: false,
  paypalEnvironment: 'sandbox',
  paypalProductionEnabled: false,
  failures,
  boundary: 'This script runs after every generator and immediately before release audit so dashboard variable drift cannot reactivate automated email or live PayPal.'
}, null, 2)}\n`);
if (failures.length) throw new Error(`Phase 1 Cloudflare configuration enforcement failed: ${failures.join('; ')}`);
console.log(`Phase 1 Cloudflare configuration enforced${after !== before ? ' and repaired' : ''}: email automation false, PayPal sandbox, live charging disabled.`);
