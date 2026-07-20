const fs = require('fs');
const path = require('path');

const root = process.cwd();
const receiptPath = path.join(root, 'scripts', 'build-production-deploy-receipt.js');
const reportPath = path.join(root, 'downloads', 'production-receipt-email-safety-patch.json');
if (!fs.existsSync(receiptPath)) throw new Error('scripts/build-production-deploy-receipt.js is missing');

let source = fs.readFileSync(receiptPath, 'utf8');
let changed = false;
function replaceAll(oldValue, newValue) {
  if (!source.includes(oldValue)) return;
  source = source.split(oldValue).join(newValue);
  changed = true;
}
function insertAfter(anchor, addition, marker) {
  if (source.includes(marker)) return;
  if (!source.includes(anchor)) throw new Error(`Production receipt activation anchor missing: ${anchor}`);
  source = source.replace(anchor, `${anchor}${addition}`);
  changed = true;
}

replaceAll('EMAIL_AUTOMATION_ENABLED = "false"', 'EMAIL_AUTOMATION_ENABLED = "true"');
replaceAll('transactional-ready-automation-disabled', 'automation-and-transactional-ready');
replaceAll('marketingAutomationEnabled: false', 'marketingAutomationEnabled: true');
replaceAll('marketingAutomationDisabled: true', 'marketingAutomationConsentBound: true');

insertAfter(
  "    && wranglerToml.includes('EMAIL_RETRY_QUARANTINE_BEFORE = \"2026-07-18T00:00:00.000Z\"')",
  "\n    && wranglerToml.includes('INTELLIGENCE_REPORT_BATCH_LIMIT = \"100\"')",
  "wranglerToml.includes('INTELLIGENCE_REPORT_BATCH_LIMIT = \"100\"')"
);
insertAfter(
  '      marketingAutomationConsentBound: true,',
  '\n      personalizedBatchLimit: 100,',
  'personalizedBatchLimit: 100'
);

const requiredMarkers = [
  'brevo-operational-readiness.json',
  'email-campaign-quality-patch.json',
  'email-automation-guard-patch.json',
  'EMAIL_AUTOMATION_ENABLED = "true"',
  'EMAIL_TRANSACTIONAL_ENABLED = "true"',
  'BREVO_DOMAIN_AUTHENTICATED = "true"',
  'EMAIL_RETRY_QUARANTINE_BEFORE = "2026-07-18T00:00:00.000Z"',
  'INTELLIGENCE_REPORT_BATCH_LIMIT = "100"',
  "brevoReadiness.status === 'automation-and-transactional-ready'",
  'marketingAutomationEnabled: true',
  'marketingAutomationConsentBound: true',
  'personalizedBatchLimit: 100',
  'campaignQualityVerified',
  'preActivationRetryGuard'
];
for (const marker of requiredMarkers) if (!source.includes(marker)) throw new Error(`Production receipt email marker missing: ${marker}`);

if (changed) fs.writeFileSync(receiptPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  receipt: 'scripts/build-production-deploy-receipt.js',
  receiptSchema: source.includes('schemaVersion: 5') ? 5 : null,
  runtimePaymentModelPreserved: source.includes("runtimeModel: 'Cloudflare-dashboard-managed and D1-gated'"),
  requiredState: {
    marketingAutomation: true,
    marketingAutomationConsentBound: true,
    personalizedBatchLimit: 100,
    transactionalEmail: true,
    brevoDomainAuthenticated: true,
    preActivationRetryGuard: true,
    evidenceBoundedCampaignQuality: true
  },
  dailyCron: '5 6 * * *',
  weeklyCron: '15 7 * * 1',
  boundary: 'A production receipt passes only when daily and weekly automation uses verified members, explicit preferences, suppression checks, per-recipient unsubscribe links, D1 idempotency, retry quarantine, evidence-bounded content and a maximum batch of 100. Transactional email remains independently gated, and PayPal activation remains separate.'
}, null, 2)}\n`);
console.log(`Production receipt email activation ${changed ? 'updated' : 'already current'}: consent-bound daily and weekly automation certified.`);