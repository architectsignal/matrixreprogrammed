const fs = require('fs');
const path = require('path');

const root = process.cwd();
const tomlPath = path.join(root, 'wrangler.toml');
const jsoncPath = path.join(root, 'wrangler.jsonc');
const reportPath = path.join(root, 'downloads', 'phase1-cloudflare-config-enforcement.json');

if (!fs.existsSync(tomlPath)) throw new Error('wrangler.toml is missing');
if (!fs.existsSync(jsoncPath)) throw new Error('wrangler.jsonc is missing');

function enforceToml(before) {
  let after = before;
  if (/^keep_vars\s*=\s*(?:true|false)\s*$/m.test(after)) {
    after = after.replace(/^keep_vars\s*=\s*(?:true|false)\s*$/m, 'keep_vars = false');
  } else {
    const compatibilityLine = /^compatibility_date\s*=.*$/m;
    if (!compatibilityLine.test(after)) throw new Error('wrangler.toml compatibility_date anchor is missing');
    after = after.replace(compatibilityLine, match => `${match}\nkeep_vars = false`);
  }
  for (const [name, value] of [['EMAIL_AUTOMATION_ENABLED', 'false'], ['PAYPAL_DONATIONS_ENABLED', 'false']]) {
    const pattern = new RegExp(`^${name}\\s*=\\s*\"(?:true|false)\"\\s*$`, 'm');
    if (pattern.test(after)) after = after.replace(pattern, `${name} = \"${value}\"`);
    else {
      const varsAnchor = /^\[vars\]\s*$/m;
      if (!varsAnchor.test(after)) throw new Error('wrangler.toml [vars] section is missing');
      after = after.replace(varsAnchor, match => `${match}\n${name} = \"${value}\"`);
    }
  }
  return after;
}

function enforceJsonc(before) {
  let after = before;
  if (/"keep_vars"\s*:\s*(?:true|false)/.test(after)) {
    after = after.replace(/"keep_vars"\s*:\s*(?:true|false)/, '"keep_vars": false');
  } else {
    const compatibility = /"compatibility_date"\s*:\s*"[^"]+"\s*,/;
    if (!compatibility.test(after)) throw new Error('wrangler.jsonc compatibility_date anchor is missing');
    after = after.replace(compatibility, match => `${match}\n  "keep_vars": false,`);
  }
  for (const [name, value] of [['EMAIL_AUTOMATION_ENABLED', 'false'], ['PAYPAL_DONATIONS_ENABLED', 'false']]) {
    const pattern = new RegExp(`\"${name}\"\\s*:\\s*\"(?:true|false)\"`);
    if (pattern.test(after)) after = after.replace(pattern, `\"${name}\": \"${value}\"`);
    else {
      const varsAnchor = /"vars"\s*:\s*\{/;
      if (!varsAnchor.test(after)) throw new Error('wrangler.jsonc vars object is missing');
      after = after.replace(varsAnchor, match => `${match}\n    \"${name}\": \"${value}\",`);
    }
  }
  return after;
}

const tomlBefore = fs.readFileSync(tomlPath, 'utf8');
const jsoncBefore = fs.readFileSync(jsoncPath, 'utf8');
const tomlAfter = enforceToml(tomlBefore);
const jsoncAfter = enforceJsonc(jsoncBefore);
const failures = [];

for (const [label, text, checks] of [
  ['wrangler.toml', tomlAfter, [
    [/^keep_vars\s*=\s*false\s*$/m, 'keep_vars must be false'],
    [/^EMAIL_AUTOMATION_ENABLED\s*=\s*"false"\s*$/m, 'email automation must be false'],
    [/^PAYPAL_DONATIONS_ENABLED\s*=\s*"false"\s*$/m, 'voluntary support checkout must be disabled by default'],
    [/^PAYPAL_ENVIRONMENT\s*=\s*"sandbox"\s*$/m, 'PayPal must remain sandbox'],
    [/^PAYPAL_PRODUCTION_ENABLED\s*=\s*"false"\s*$/m, 'PayPal production must remain disabled']
  ]],
  ['wrangler.jsonc', jsoncAfter, [
    [/"keep_vars"\s*:\s*false/, 'keep_vars must be false'],
    [/"EMAIL_AUTOMATION_ENABLED"\s*:\s*"false"/, 'email automation must be false'],
    [/"PAYPAL_DONATIONS_ENABLED"\s*:\s*"false"/, 'voluntary support checkout must be disabled by default'],
    [/"PAYPAL_ENVIRONMENT"\s*:\s*"sandbox"/, 'PayPal must remain sandbox'],
    [/"PAYPAL_PRODUCTION_ENABLED"\s*:\s*"false"/, 'PayPal production must remain disabled']
  ]]
]) {
  for (const [pattern, message] of checks) if (!pattern.test(text)) failures.push(`${label}: ${message}`);
  if (/EMAIL_AUTOMATION_ENABLED[^\n]*true/.test(text)) failures.push(`${label}: EMAIL_AUTOMATION_ENABLED=true remains`);
  if (/PAYPAL_DONATIONS_ENABLED[^\n]*true/.test(text)) failures.push(`${label}: PAYPAL_DONATIONS_ENABLED=true remains`);
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
  changed,
  sourcesOfTruth: ['wrangler.jsonc', 'wrangler.toml'],
  activePrecedenceProtected: true,
  keepVars: false,
  emailAutomationEnabled: false,
  paypalDonationsEnabled: false,
  paypalEnvironment: 'sandbox',
  paypalProductionEnabled: false,
  failures,
  boundary: 'Both Wrangler configuration formats are locked after every generator. The active JSONC configuration cannot preserve dashboard drift or reactivate automated email, voluntary support checkout, or live PayPal.'
}, null, 2)}\n`);
if (failures.length) throw new Error(`Phase 1 Cloudflare configuration enforcement failed: ${failures.join('; ')}`);
console.log(`Phase 1 Cloudflare configuration enforced in TOML and JSONC${changed.toml || changed.jsonc ? ' and repaired' : ''}: email automation false, voluntary support disabled, PayPal sandbox, live charging disabled.`);
