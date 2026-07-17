const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const tomlPath = path.join(root, 'wrangler.toml');
const jsoncPath = path.join(root, 'wrangler.jsonc');
const outputPath = path.join(root, 'downloads', 'brevo-operational-readiness.json');

for (const file of [workerPath, tomlPath, jsoncPath]) if (!fs.existsSync(file)) throw new Error(`Brevo readiness source missing: ${path.relative(root, file)}`);
const worker = fs.readFileSync(workerPath, 'utf8');
const toml = fs.readFileSync(tomlPath, 'utf8');
const jsonc = fs.readFileSync(jsoncPath, 'utf8');

function both(tomlPattern, jsoncPattern) { return tomlPattern.test(toml) && jsoncPattern.test(jsonc); }
const codeChecks = {
  emailLifecycleD1Authoritative: worker.includes("X-Matrix-Origin':'cloudflare-worker-email-lifecycle") && worker.includes('MEMBERS_DB'),
  explicitConsentRequired: worker.includes('Explicit email consent is required'),
  verificationTokensPresent: worker.includes("'verify_marketing'") && worker.includes('email_action_tokens'),
  unsubscribeAndSuppressionPresent: worker.includes('handleUnsubscribe') && worker.includes('email_suppressions'),
  brevoWebhookProtected: worker.includes('EMAIL_WEBHOOK_SECRET') && worker.includes('email_webhook_receipts'),
  outboxRetryPresent: worker.includes("status='retry'") && worker.includes('attempts>=5'),
  replyToSupported: worker.includes('replyTo:env.MEMBERS_REPLY_TO_EMAIL'),
  temporaryBrevoDomainDetected: worker.includes('temporaryBrevoDomain'),
  domainAuthenticationGate: worker.includes('BREVO_DOMAIN_AUTHENTICATED') && worker.includes('Brevo sender domain authentication has not been confirmed'),
  transactionalActivationGate: worker.includes('EMAIL_TRANSACTIONAL_ENABLED') && worker.includes('Transactional email delivery is disabled until Phase 2 readiness is approved'),
  adminHealthProtected: worker.includes("if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403)"),
  manualRetryQuarantineProtected: worker.includes('/api/email/admin/quarantine-retries') && worker.includes('QUARANTINE_PREACTIVATION_RETRIES') && worker.includes('email.outbox.legacy_retries_quarantined'),
  automaticRetryQuarantineConfigured: worker.includes('async function quarantineConfiguredRetries') && worker.includes('EMAIL_RETRY_QUARANTINE_BEFORE') && worker.includes('email.outbox.configured_retries_quarantined'),
  dailyCampaignSourceReady: worker.includes('/data/daily-brain-brief.json'),
  weeklyCampaignSourceReady: worker.includes('/data/weekly-investigation-conclusions.json'),
  evidenceBoundedFallback: worker.includes('No verified source changes loaded') && worker.includes('Fail-closed content boundary'),
  perRecipientPreferenceAndUnsubscribe: worker.includes('subscriber-dashboard.html?token=') && worker.includes('/api/email/unsubscribe?token='),
  listUnsubscribeHeaders: worker.includes("'List-Unsubscribe'") && worker.includes("'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'"),
  reusableMarketingActionLinks: worker.includes("const reusable=['preferences','unsubscribe'].includes(purpose)"),
  zeroRecipientCampaignCompletion: worker.includes("const status=recipients.length?'sending':'sent'")
};

const configurationChecks = {
  marketingAutomationOn: both(/^EMAIL_AUTOMATION_ENABLED\s*=\s*"true"\s*$/m, /"EMAIL_AUTOMATION_ENABLED"\s*:\s*"true"/),
  transactionalDeliveryOn: both(/^EMAIL_TRANSACTIONAL_ENABLED\s*=\s*"true"\s*$/m, /"EMAIL_TRANSACTIONAL_ENABLED"\s*:\s*"true"/),
  domainAuthenticationConfirmed: both(/^BREVO_DOMAIN_AUTHENTICATED\s*=\s*"true"\s*$/m, /"BREVO_DOMAIN_AUTHENTICATED"\s*:\s*"true"/),
  retryQuarantineCutoffConfigured: both(/^EMAIL_RETRY_QUARANTINE_BEFORE\s*=\s*"2026-07-18T00:00:00\.000Z"\s*$/m, /"EMAIL_RETRY_QUARANTINE_BEFORE"\s*:\s*"2026-07-18T00:00:00\.000Z"/),
  senderEmailConfigured: both(/^MEMBERS_FROM_EMAIL\s*=\s*"members@matrixreprogrammed\.com"\s*$/m, /"MEMBERS_FROM_EMAIL"\s*:\s*"members@matrixreprogrammed\.com"/),
  senderNameConfigured: both(/^MEMBERS_FROM_NAME\s*=\s*"Matrix Reprogrammed"\s*$/m, /"MEMBERS_FROM_NAME"\s*:\s*"Matrix Reprogrammed"/),
  replyToEmailConfigured: both(/^MEMBERS_REPLY_TO_EMAIL\s*=\s*"njmgroupfrance@gmail\.com"\s*$/m, /"MEMBERS_REPLY_TO_EMAIL"\s*:\s*"njmgroupfrance@gmail\.com"/),
  replyToNameConfigured: both(/^MEMBERS_REPLY_TO_NAME\s*=\s*"Matrix Reprogrammed Support"\s*$/m, /"MEMBERS_REPLY_TO_NAME"\s*:\s*"Matrix Reprogrammed Support"/),
  dailyCronConfigured: both(/"5 6 \* \* \*"/, /"5 6 \* \* \*"/),
  weeklyCronConfigured: both(/"15 7 \* \* 1"/, /"15 7 \* \* 1"/)
};

const codeReady = Object.values(codeChecks).every(Boolean);
const liveConfigurationReady = Object.values(configurationChecks).every(Boolean);
const checks = { ...codeChecks, ...configurationChecks };
const status = !codeReady
  ? 'code-not-ready'
  : liveConfigurationReady
    ? 'email-automation-live-guarded'
    : 'configuration-inconsistent';

const report = {
  ok: codeReady && liveConfigurationReady,
  generatedAt: new Date().toISOString(),
  phase: 3,
  status,
  checks,
  currentSafetyState: {
    marketingAutomation: configurationChecks.marketingAutomationOn,
    transactionalDelivery: configurationChecks.transactionalDeliveryOn,
    domainAuthenticationConfirmed: configurationChecks.domainAuthenticationConfirmed,
    senderEmail: configurationChecks.senderEmailConfigured ? 'members@matrixreprogrammed.com' : null,
    replyToEmail: configurationChecks.replyToEmailConfigured ? 'njmgroupfrance@gmail.com' : null,
    retryQuarantineBefore: configurationChecks.retryQuarantineCutoffConfigured ? '2026-07-18T00:00:00.000Z' : null,
    manualRetryQuarantineAvailable: codeChecks.manualRetryQuarantineProtected,
    automaticRetryQuarantineAvailable: codeChecks.automaticRetryQuarantineConfigured,
    dailyCampaignSource: codeChecks.dailyCampaignSourceReady ? '/data/daily-brain-brief.json' : null,
    weeklyCampaignSource: codeChecks.weeklyCampaignSourceReady ? '/data/weekly-investigation-conclusions.json' : null,
    perRecipientUnsubscribe: codeChecks.perRecipientPreferenceAndUnsubscribe && codeChecks.listUnsubscribeHeaders
  },
  schedules: {
    dailyUtc: '06:05',
    weeklyUtc: 'Monday 07:15',
    franceSummer: { daily: '08:05', weekly: 'Monday 09:15' },
    franceWinter: { daily: '07:05', weekly: 'Monday 08:15' }
  },
  requiredRuntimeSecrets: ['BREVO_API_KEY','EMAIL_WEBHOOK_SECRET','ADMIN_API_TOKEN'],
  monitoringSteps: [
    'Confirm the first scheduled daily campaign uses /data/daily-brain-brief.json and completes without retrying pre-activation messages.',
    'Confirm the first scheduled weekly campaign uses /data/weekly-investigation-conclusions.json.',
    'Verify the Brevo transactional webhook records delivery, bounce, complaint, click and unsubscribe events.',
    'Review campaign delivery, suppression and retry counts after each of the first three scheduled runs.'
  ],
  boundary: 'Daily and weekly automation is allowed only with authenticated transactional delivery, explicit consent, active verified preferences, automatic quarantine of retry records predating activation, evidence-bounded source content and per-recipient preference and unsubscribe controls.'
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Brevo operational readiness audit failed: ${status} ${JSON.stringify({ codeChecks, configurationChecks })}`);
console.log(`Brevo operational readiness audit passed: ${status}.`);
