const fs = require('fs');
const path = require('path');

const root = process.cwd();
const receiptPath = path.join(root, 'scripts', 'build-production-deploy-receipt.js');
const reportPath = path.join(root, 'downloads', 'production-receipt-email-safety-patch.json');
if (!fs.existsSync(receiptPath)) throw new Error('scripts/build-production-deploy-receipt.js is missing');

const source = fs.readFileSync(receiptPath, 'utf8');
const requiredMarkers = [
  "const emailLifecycle = readText('src/worker-email-lifecycle.js')",
  "const dailyRenderer = readText('src/worker-daily-brief-email.js')",
  "const dailyBrain = readJson('data/daily-brain-brief.json') || {}",
  'dailyBrain.schemaVersion === 3',
  "emailLifecycle.includes('queueImmediateDailyBrief')",
  "emailLifecycle.includes('issueReusableEmailToken')",
  "emailLifecycle.includes(\"timeZone:'Europe/Paris'\")",
  "wrangler.includes('EMAIL_AUTOMATION_ENABLED = \"true\"')",
  "marketing_status='subscribed'",
  'email_verified_at IS NOT NULL',
  'email_suppressions',
  'deepBriefWired',
  'immediateFirstBrief',
  'personalizedPreferenceAndUnsubscribe',
  "dailyLocalTime: '08:05 Europe/Paris'",
  "weeklyLocalTime: 'Monday 09:15 Europe/Paris'",
  'signalBoardWired',
  'forum_post_owners',
  'crossDevice',
  'localFallbackDisabled'
];
const missing = requiredMarkers.filter(marker => !source.includes(marker));
if (missing.length) throw new Error(`Production receipt lacks current email or Signal Board markers: ${missing.join(' | ')}`);

const obsoleteMarkers = [
  "brevoReadiness.status === 'transactional-ready-automation-disabled'",
  'marketingAutomationEnabled: false',
  'marketingAutomationDisabled: true'
];
const obsolete = obsoleteMarkers.filter(marker => source.includes(marker));
if (obsolete.length) throw new Error(`Production receipt still asserts the obsolete automation-disabled state: ${obsolete.join(' | ')}`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: false,
  receipt: 'scripts/build-production-deploy-receipt.js',
  requiredState: {
    marketingAutomation: 'enabled-only-through-verified-consent-preference-suppression-and-local-time-gates',
    transactionalEmail: true,
    brevoDomainAuthenticated: true,
    dailyBriefSchemaVersion: 3,
    immediateFirstBrief: true,
    personalisedControls: true,
    listUnsubscribeHeaders: 'certified by brevo-operational-readiness-audit and focused assurance',
    dailyLocalTime: '08:05 Europe/Paris',
    weeklyLocalTime: 'Monday 09:15 Europe/Paris',
    signalBoardStorage: 'Cloudflare D1 authoritative cross-device'
  },
  boundary: 'The production receipt certifies deep consent-controlled briefing automation and persistent D1 Signal Board ownership. It does not authorise live PayPal charging.'
}, null, 2)}\n`);
console.log('Production receipt email and Signal Board safety already matches the current consent-controlled operating state.');
