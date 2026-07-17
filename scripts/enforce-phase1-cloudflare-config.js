const fs = require('fs');
const path = require('path');

const root = process.cwd();
const tomlPath = path.join(root, 'wrangler.toml');
const jsoncPath = path.join(root, 'wrangler.jsonc');
const reportPath = path.join(root, 'downloads', 'phase1-cloudflare-config-enforcement.json');

if (!fs.existsSync(tomlPath)) throw new Error('wrangler.toml is missing');
if (!fs.existsSync(jsoncPath)) throw new Error('wrangler.jsonc is missing');

const lockedVars = [
  ['EMAIL_AUTOMATION_ENABLED', 'true'],
  ['EMAIL_TRANSACTIONAL_ENABLED', 'true'],
  ['BREVO_DOMAIN_AUTHENTICATED', 'true'],
  ['EMAIL_RETRY_QUARANTINE_BEFORE', '2026-07-18T00:00:00.000Z'],
  ['MEMBERS_FROM_EMAIL', 'members@matrixreprogrammed.com'],
  ['MEMBERS_FROM_NAME', 'Matrix Reprogrammed'],
  ['MEMBERS_REPLY_TO_EMAIL', 'njmgroupfrance@gmail.com'],
  ['MEMBERS_REPLY_TO_NAME', 'Matrix Reprogrammed Support'],
  ['PAYPAL_DONATIONS_ENABLED', 'false']
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function enforceToml(before) {
  let after = before;
  if (/^keep_vars\s*=\s*(?:true|false)\s*$/m.test(after)) after = after.replace(/^keep_vars\s*=\s*(?:true|false)\s*$/m, 'keep_vars = false');
  else {
    const compatibilityLine = /^compatibility_date\s*=.*$/m;
    if (!compatibilityLine.test(after)) throw new Error('wrangler.toml compatibility_date anchor is missing');
    after = after.replace(compatibilityLine, match => `${match}\nkeep_vars = false`);
  }
  for (const [name, value] of lockedVars) {
    const pattern = new RegExp(`^${escapeRegex(name)}\\s*=\\s*"[^"]*"\\s*$`, 'm');
    if (pattern.test(after)) after = after.replace(pattern, `${name} = "${value}"`);
    else {
      const varsAnchor = /^\[vars\]\s*$/m;
      if (!varsAnchor.test(after)) throw new Error('wrangler.toml [vars] section is missing');
      after = after.replace(varsAnchor, match => `${match}\n${name} = "${value}"`);
    }
  }
  return after;
}

function enforceJsonc(before) {
  let after = before;
  if (/"keep_vars"\s*:\s*(?:true|false)/.test(after)) after = after.replace(/"keep_vars"\s*:\s*(?:true|false)/, '"keep_vars": false');
  else {
    const compatibility = /"compatibility_date"\s*:\s*"[^"]+"\s*,/;
    if (!compatibility.test(after)) throw new Error('wrangler.jsonc compatibility_date anchor is missing');
    after = after.replace(compatibility, match => `${match}\n  "keep_vars": false,`);
  }
  for (const [name, value] of lockedVars) {
    const pattern = new RegExp(`"${escapeRegex(name)}"\\s*:\\s*"[^"]*"`);
    if (pattern.test(after)) after = after.replace(pattern, `"${name}": "${value}"`);
    else {
      const varsAnchor = /"vars"\s*:\s*\{/;
      if (!varsAnchor.test(after)) throw new Error('wrangler.jsonc vars object is missing');
      after = after.replace(varsAnchor, match => `${match}\n    "${name}": "${value}",`);
    }
  }
  return after;
}

const tomlBefore = fs.readFileSync(tomlPath, 'utf8');
const jsoncBefore = fs.readFileSync(jsoncPath, 'utf8');
const tomlAfter = enforceToml(tomlBefore);
const jsoncAfter = enforceJsonc(jsoncBefore);
const failures = [];

const exactToml = value => new RegExp(`^${escapeRegex(value[0])}\\s*=\\s*"${escapeRegex(value[1])}"\\s*$`, 'm');
const exactJsonc = value => new RegExp(`"${escapeRegex(value[0])}"\\s*:\\s*"${escapeRegex(value[1])}"`);

for (const [label, text, checks] of [
  ['wrangler.toml', tomlAfter, [
    [/^keep_vars\s*=\s*false\s*$/m, 'keep_vars must be false'],
    ...lockedVars.map(value => [exactToml(value), `${value[0]} must equal ${value[1]}`]),
    [/^PAYPAL_ENVIRONMENT\s*=\s*"sandbox"\s*$/m, 'PayPal must remain sandbox'],
    [/^PAYPAL_PRODUCTION_ENABLED\s*=\s*"false"\s*$/m, 'PayPal production must remain disabled']
  ]],
  ['wrangler.jsonc', jsoncAfter, [
    [/"keep_vars"\s*:\s*false/, 'keep_vars must be false'],
    ...lockedVars.map(value => [exactJsonc(value), `${value[0]} must equal ${value[1]}`]),
    [/"PAYPAL_ENVIRONMENT"\s*:\s*"sandbox"/, 'PayPal must remain sandbox'],
    [/"PAYPAL_PRODUCTION_ENABLED"\s*:\s*"false"/, 'PayPal production must remain disabled']
  ]]
]) {
  for (const [pattern, message] of checks) if (!pattern.test(text)) failures.push(`${label}: ${message}`);
}

if (!failures.length) {
  if (tomlAfter !== tomlBefore) fs.writeFileSync(tomlPath, tomlAfter);
  if (jsoncAfter !== jsoncBefore) fs.writeFileSync(jsoncPath, jsoncAfter);
}

const changed = { toml: tomlAfter !== tomlBefore, jsonc: jsoncAfter !== jsoncBefore };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  phase: 3,
  changed,
  sourcesOfTruth: ['wrangler.jsonc', 'wrangler.toml'],
  activePrecedenceProtected: true,
  keepVars: false,
  emailAutomationEnabled: true,
  emailTransactionalEnabled: true,
  brevoDomainAuthenticated: true,
  retryQuarantineBefore: '2026-07-18T00:00:00.000Z',
  membersFromEmail: 'members@matrixreprogrammed.com',
  membersReplyToEmail: 'njmgroupfrance@gmail.com',
  paypalDonationsEnabled: false,
  paypalEnvironment: 'sandbox',
  paypalProductionEnabled: false,
  failures,
  boundary: 'Both Wrangler formats are locked after every generator. Authenticated transactional email and guarded daily and weekly campaigns are active; retry records predating activation are automatically quarantined before any scheduled campaign sends.'
}, null, 2)}\n`);
if (failures.length) throw new Error(`Cloudflare configuration enforcement failed: ${failures.join('; ')}`);
console.log(`Cloudflare configuration enforced${changed.toml || changed.jsonc ? ' and repaired' : ''}: transactional email and guarded marketing automation on, legacy retries quarantined by cutoff, PayPal sandbox.`);
