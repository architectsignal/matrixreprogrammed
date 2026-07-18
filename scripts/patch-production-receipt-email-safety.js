const fs = require('fs');
const path = require('path');

const root = process.cwd();
const receiptPath = path.join(root, 'scripts', 'build-production-deploy-receipt.js');
const reportPath = path.join(root, 'downloads', 'production-receipt-email-safety-patch.json');
if (!fs.existsSync(receiptPath)) throw new Error('scripts/build-production-deploy-receipt.js is missing');

let source = fs.readFileSync(receiptPath, 'utf8');
let changed = false;
function replaceRequired(oldValue, newValue, label) {
  if (source.includes(newValue)) return;
  if (!source.includes(oldValue)) throw new Error(`${label} target not found`);
  source = source.replace(oldValue, newValue);
  changed = true;
}

replaceRequired(
  "  const bootstrap = live.bootstrapBoundary || {};",
  "  const bootstrap = live.bootstrapBoundary || {};\n  const brevoReadiness = readJson('downloads/brevo-operational-readiness.json') || {};\n  const emailCampaignQuality = readJson('downloads/email-campaign-quality-patch.json') || {};\n  const emailAutomationGuard = readJson('downloads/email-automation-guard-patch.json') || {};",
  'Email readiness receipt imports'
);
replaceRequired(
  "    && wrangler.includes('EMAIL_AUTOMATION_ENABLED = \"true\"')\n    && wrangler.includes('\"5 6 * * *\"')",
  "    && wrangler.includes('EMAIL_AUTOMATION_ENABLED = \"false\"')\n    && wrangler.includes('EMAIL_TRANSACTIONAL_ENABLED = \"true\"')\n    && wrangler.includes('BREVO_DOMAIN_AUTHENTICATED = \"true\"')\n    && wrangler.includes('EMAIL_RETRY_QUARANTINE_BEFORE = \"2026-07-18T00:00:00.000Z\"')\n    && brevoReadiness.ok === true\n    && brevoReadiness.status === 'transactional-ready-automation-disabled'\n    && emailCampaignQuality.ok === true\n    && emailAutomationGuard.ok === true\n    && wrangler.includes('\"5 6 * * *\"')",
  'Email production receipt state'
);
replaceRequired(
  "      verifiedSelfReportDeliveryWired: reportDeliveryWired,\n      dailyCron: '5 6 * * *',\n      weeklyCron: '15 7 * * 1',\n      providerSecretsRequired: ['BREVO_API_KEY', 'MEMBERS_FROM_EMAIL', 'EMAIL_WEBHOOK_SECRET']",
  "      verifiedSelfReportDeliveryWired: reportDeliveryWired,\n      brevoReady: brevoReadiness.ok === true,\n      brevoStatus: brevoReadiness.status || null,\n      domainAuthenticationConfirmed: true,\n      transactionalDeliveryEnabled: true,\n      marketingAutomationEnabled: false,\n      marketingAutomationDisabled: true,\n      preActivationRetryGuard: emailAutomationGuard.ok === true,\n      campaignQualityVerified: emailCampaignQuality.ok === true,\n      dailySource: emailCampaignQuality.dailySource || null,\n      weeklySource: emailCampaignQuality.weeklySource || null,\n      replyToSupported: brevoReadiness.checks?.replyToSupported === true,\n      dailyCron: '5 6 * * *',\n      weeklyCron: '15 7 * * 1',\n      providerSecretsRequired: ['BREVO_API_KEY', 'MEMBERS_FROM_EMAIL', 'MEMBERS_REPLY_TO_EMAIL', 'EMAIL_WEBHOOK_SECRET', 'ADMIN_API_TOKEN']",
  'Email receipt details'
);
replaceRequired(
  "      && emailBoundaryPassed\n      && reportDeliveryWired",
  "      && emailBoundaryPassed\n      && brevoReadiness.ok === true\n      && brevoReadiness.status === 'transactional-ready-automation-disabled'\n      && emailCampaignQuality.ok === true\n      && emailAutomationGuard.ok === true\n      && reportDeliveryWired",
  'Email receipt acceptance gate'
);

for (const marker of [
  'brevo-operational-readiness.json',
  'email-campaign-quality-patch.json',
  'email-automation-guard-patch.json',
  'EMAIL_AUTOMATION_ENABLED = "false"',
  'EMAIL_TRANSACTIONAL_ENABLED = "true"',
  'BREVO_DOMAIN_AUTHENTICATED = "true"',
  'EMAIL_RETRY_QUARANTINE_BEFORE = "2026-07-18T00:00:00.000Z"',
  "brevoReadiness.status === 'transactional-ready-automation-disabled'",
  'marketingAutomationEnabled: false',
  'marketingAutomationDisabled: true',
  'campaignQualityVerified',
  'preActivationRetryGuard'
]) if (!source.includes(marker)) throw new Error(`Production receipt email marker missing: ${marker}`);

if (changed) fs.writeFileSync(receiptPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  receipt: 'scripts/build-production-deploy-receipt.js',
  requiredState: {
    marketingAutomation: false,
    transactionalEmail: true,
    brevoDomainAuthenticated: true,
    preActivationRetryGuard: true,
    evidenceBoundedCampaignQuality: true
  },
  dailyCron: '5 6 * * *',
  weeklyCron: '15 7 * * 1',
  boundary: 'A production receipt passes when authenticated transactional delivery is ready, scheduled marketing remains disabled, legacy retries are quarantined, evidence-bounded campaign code and unsubscribe controls are present, and no bulk campaign can send without separate activation.'
}, null, 2)}\n`);
console.log(`Production receipt email safety ${changed ? 'updated' : 'already current'}.`);
