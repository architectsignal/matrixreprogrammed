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
  "  const bootstrap = live.bootstrapBoundary || {};\n  const brevoReadiness = readJson('downloads/brevo-operational-readiness.json') || {};",
  'Brevo readiness receipt import'
);
replaceRequired(
  "    && wrangler.includes('EMAIL_AUTOMATION_ENABLED = \"true\"')\n    && wrangler.includes('\"5 6 * * *\"')",
  "    && wrangler.includes('EMAIL_AUTOMATION_ENABLED = \"false\"')\n    && wrangler.includes('EMAIL_TRANSACTIONAL_ENABLED = \"false\"')\n    && wrangler.includes('BREVO_DOMAIN_AUTHENTICATED = \"false\"')\n    && brevoReadiness.ok === true\n    && wrangler.includes('\"5 6 * * *\"')",
  'Email safety receipt state'
);
replaceRequired(
  "      verifiedSelfReportDeliveryWired: reportDeliveryWired,\n      dailyCron: '5 6 * * *',\n      weeklyCron: '15 7 * * 1',\n      providerSecretsRequired: ['BREVO_API_KEY', 'MEMBERS_FROM_EMAIL', 'EMAIL_WEBHOOK_SECRET']",
  "      verifiedSelfReportDeliveryWired: reportDeliveryWired,\n      brevoCodeReady: brevoReadiness.ok === true,\n      brevoStatus: brevoReadiness.status || null,\n      domainAuthenticationConfirmed: false,\n      transactionalDeliveryEnabled: false,\n      marketingAutomationEnabled: false,\n      replyToSupported: brevoReadiness.checks?.replyToSupported === true,\n      dailyCron: '5 6 * * *',\n      weeklyCron: '15 7 * * 1',\n      providerSecretsRequired: ['BREVO_API_KEY', 'MEMBERS_FROM_EMAIL', 'MEMBERS_REPLY_TO_EMAIL', 'EMAIL_WEBHOOK_SECRET', 'ADMIN_API_TOKEN']",
  'Email receipt details'
);
replaceRequired(
  "      && emailBoundaryPassed\n      && reportDeliveryWired",
  "      && emailBoundaryPassed\n      && brevoReadiness.ok === true\n      && reportDeliveryWired",
  'Brevo receipt acceptance gate'
);

for (const marker of [
  "brevo-operational-readiness.json",
  "EMAIL_AUTOMATION_ENABLED = \"false\"",
  "EMAIL_TRANSACTIONAL_ENABLED = \"false\"",
  "BREVO_DOMAIN_AUTHENTICATED = \"false\"",
  'brevoCodeReady',
  'replyToSupported'
]) if (!source.includes(marker)) throw new Error(`Production receipt safety marker missing: ${marker}`);

if (changed) fs.writeFileSync(receiptPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  receipt: 'scripts/build-production-deploy-receipt.js',
  requiredState: {
    marketingAutomation: false,
    transactionalEmail: false,
    brevoDomainAuthenticated: false,
    brevoCodeReady: true
  },
  boundary: 'A production receipt may pass with email systems staged and fail-closed. It must not require marketing automation or unauthenticated transactional delivery to be enabled.'
}, null, 2)}\n`);
console.log(`Production receipt email safety ${changed ? 'updated' : 'already current'}.`);
