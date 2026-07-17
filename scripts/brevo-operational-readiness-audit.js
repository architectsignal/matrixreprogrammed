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
  legacyRetryQuarantineProtected: worker.includes('/api/email/admin/quarantine-retries') && worker.includes('QUARANTINE_PREACTIVATION_RETRIES') && worker.includes("status='quarantined'") && worker.includes('email.outbox.legacy_retries_quarantined')
};

const configurationChecks = {
  marketingAutomationOff: both(/^EMAIL_AUTOMATION_ENABLED\s*=\s*"false"\s*$/m, /"EMAIL_AUTOMATION_ENABLED"\s*:\s*"false"/),
  transactionalDeliveryOn: both(/^EMAIL_TRANSACTIONAL_ENABLED\s*=\s*"true"\s*$/m, /"EMAIL_TRANSACTIONAL_ENABLED"\s*:\s*"true"/),
  domainAuthenticationConfirmed: both(/^BREVO_DOMAIN_AUTHENTICATED\s*=\s*"true"\s*$/m, /"BREVO_DOMAIN_AUTHENTICATED"\s*:\s*"true"/),
  senderEmailConfigured: both(/^MEMBERS_FROM_EMAIL\s*=\s*"members@matrixreprogrammed\.com"\s*$/m, /"MEMBERS_FROM_EMAIL"\s*:\s*"members@matrixreprogrammed\.com"/),
  senderNameConfigured: both(/^MEMBERS_FROM_NAME\s*=\s*"Matrix Reprogrammed"\s*$/m, /"MEMBERS_FROM_NAME"\s*:\s*"Matrix Reprogrammed"/),
  replyToEmailConfigured: both(/^MEMBERS_REPLY_TO_EMAIL\s*=\s*"njmgroupfrance@gmail\.com"\s*$/m, /"MEMBERS_REPLY_TO_EMAIL"\s*:\s*"njmgroupfrance@gmail\.com"/),
  replyToNameConfigured: both(/^MEMBERS_REPLY_TO_NAME\s*=\s*"Matrix Reprogrammed Support"\s*$/m, /"MEMBERS_REPLY_TO_NAME"\s*:\s*"Matrix Reprogrammed Support"/)
};

const stagingChecks = {
  transactionalDeliveryOff: both(/^EMAIL_TRANSACTIONAL_ENABLED\s*=\s*"false"\s*$/m, /"EMAIL_TRANSACTIONAL_ENABLED"\s*:\s*"false"/),
  domainAuthenticationUnconfirmed: both(/^BREVO_DOMAIN_AUTHENTICATED\s*=\s*"false"\s*$/m, /"BREVO_DOMAIN_AUTHENTICATED"\s*:\s*"false"/)
};

const codeReady = Object.values(codeChecks).every(Boolean);
const transactionalActivationReady = Object.values(configurationChecks).every(Boolean);
const coherentStagingState = configurationChecks.marketingAutomationOff && stagingChecks.transactionalDeliveryOff && stagingChecks.domainAuthenticationUnconfirmed;
const configurationCoherent = transactionalActivationReady || coherentStagingState;
const checks = { ...codeChecks, ...configurationChecks };
const status = !codeReady
  ? 'code-not-ready'
  : transactionalActivationReady
    ? 'transactional-live-marketing-off'
    : coherentStagingState
      ? 'code-ready-runtime-activation-required'
      : 'configuration-inconsistent';

const remainingSteps = transactionalActivationReady ? [
  'Confirm BREVO_API_KEY, EMAIL_WEBHOOK_SECRET and ADMIN_API_TOKEN are stored as Cloudflare secrets.',
  'Run real verification, welcome and passwordless-login inbox tests.',
  'Quarantine pre-activation retry records through the protected administrator console while marketing automation remains off.',
  'Configure and verify the Brevo transactional webhook for delivery, bounce, complaint, click and unsubscribe events.',
  'Enable EMAIL_AUTOMATION_ENABLED only after daily and weekly campaign acceptance tests pass.'
] : [
  'Authenticate the Matrix Reprogrammed sender domain in Brevo.',
  'Configure the verified sender and monitored reply-to identity.',
  'Set BREVO_DOMAIN_AUTHENTICATED=true and EMAIL_TRANSACTIONAL_ENABLED=true while keeping EMAIL_AUTOMATION_ENABLED=false.'
];

const report = {
  ok: codeReady && configurationCoherent,
  generatedAt: new Date().toISOString(),
  phase: transactionalActivationReady ? 2 : 1,
  status,
  checks,
  stagingChecks,
  currentSafetyState: {
    marketingAutomation: false,
    transactionalDelivery: transactionalActivationReady,
    domainAuthenticationConfirmed: configurationChecks.domainAuthenticationConfirmed,
    senderEmail: configurationChecks.senderEmailConfigured ? 'members@matrixreprogrammed.com' : null,
    replyToEmail: configurationChecks.replyToEmailConfigured ? 'njmgroupfrance@gmail.com' : null,
    legacyRetryQuarantineAvailable: codeChecks.legacyRetryQuarantineProtected
  },
  requiredRuntimeSecrets: ['BREVO_API_KEY','EMAIL_WEBHOOK_SECRET','ADMIN_API_TOKEN'],
  remainingSteps,
  boundary: 'Transactional sending may be enabled only with an authenticated domain, verified sender, monitored reply-to identity and fail-closed delivery gates. Pre-activation retries must be quarantined before bulk daily and weekly automation is enabled.'
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Brevo operational readiness audit failed: ${status} ${JSON.stringify({ codeChecks, configurationChecks, stagingChecks })}`);
console.log(`Brevo operational readiness audit passed: ${status}.`);
