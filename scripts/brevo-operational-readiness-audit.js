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
const checks = {
  emailLifecycleD1Authoritative: worker.includes("X-Matrix-Origin':'cloudflare-worker-email-lifecycle") && worker.includes('MEMBERS_DB'),
  explicitConsentRequired: worker.includes("Explicit email consent is required"),
  verificationTokensPresent: worker.includes("'verify_marketing'") && worker.includes('email_action_tokens'),
  unsubscribeAndSuppressionPresent: worker.includes('handleUnsubscribe') && worker.includes('email_suppressions'),
  brevoWebhookProtected: worker.includes('EMAIL_WEBHOOK_SECRET') && worker.includes('email_webhook_receipts'),
  outboxRetryPresent: worker.includes("status='retry'") && worker.includes('attempts>=5'),
  replyToSupported: worker.includes('replyTo:env.MEMBERS_REPLY_TO_EMAIL'),
  temporaryBrevoDomainDetected: worker.includes('temporaryBrevoDomain'),
  domainAuthenticationGate: worker.includes('BREVO_DOMAIN_AUTHENTICATED') && worker.includes('Brevo sender domain authentication has not been confirmed'),
  transactionalActivationGate: worker.includes('EMAIL_TRANSACTIONAL_ENABLED') && worker.includes('Transactional email delivery is disabled until Phase 2 readiness is approved'),
  adminHealthProtected: worker.includes("if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403)"),
  marketingAutomationOff: both(/^EMAIL_AUTOMATION_ENABLED\s*=\s*"false"\s*$/m, /"EMAIL_AUTOMATION_ENABLED"\s*:\s*"false"/),
  transactionalDeliveryOff: both(/^EMAIL_TRANSACTIONAL_ENABLED\s*=\s*"false"\s*$/m, /"EMAIL_TRANSACTIONAL_ENABLED"\s*:\s*"false"/),
  domainAuthenticationUnconfirmed: both(/^BREVO_DOMAIN_AUTHENTICATED\s*=\s*"false"\s*$/m, /"BREVO_DOMAIN_AUTHENTICATED"\s*:\s*"false"/),
  senderNameConfigured: both(/^MEMBERS_FROM_NAME\s*=\s*"Matrix Reprogrammed"\s*$/m, /"MEMBERS_FROM_NAME"\s*:\s*"Matrix Reprogrammed"/),
  replyToNameConfigured: both(/^MEMBERS_REPLY_TO_NAME\s*=\s*"Matrix Reprogrammed Support"\s*$/m, /"MEMBERS_REPLY_TO_NAME"\s*:\s*"Matrix Reprogrammed Support"/),
  senderEmailNotHardcoded: !/MEMBERS_FROM_EMAIL\s*=/.test(toml) && !/"MEMBERS_FROM_EMAIL"\s*:/.test(jsonc),
  replyToEmailNotHardcoded: !/MEMBERS_REPLY_TO_EMAIL\s*=/.test(toml) && !/"MEMBERS_REPLY_TO_EMAIL"\s*:/.test(jsonc)
};
const codeReady = Object.values(checks).every(Boolean);
const externalSteps = [
  'Authenticate a dedicated Matrix Reprogrammed sending domain or subdomain in Brevo with DKIM and DMARC.',
  'Create a real sender mailbox or verified alias and set MEMBERS_FROM_EMAIL.',
  'Create a monitored support mailbox or alias and set MEMBERS_REPLY_TO_EMAIL.',
  'Confirm BREVO_API_KEY, EMAIL_WEBHOOK_SECRET and ADMIN_API_TOKEN are stored as Cloudflare secrets.',
  'Configure the Brevo transactional webhook for delivery, bounce, complaint, click and unsubscribe events.',
  'Run inbox tests to Gmail, Outlook, Yahoo and a custom domain and verify SPF, DKIM and DMARC pass.',
  'After those tests, set BREVO_DOMAIN_AUTHENTICATED=true and EMAIL_TRANSACTIONAL_ENABLED=true while keeping EMAIL_AUTOMATION_ENABLED=false.'
];
const status = codeReady ? 'code-ready-external-authentication-required' : 'code-not-ready';
const report = {
  ok: codeReady,
  generatedAt: new Date().toISOString(),
  phase: 2,
  status,
  checks,
  currentSafetyState: {
    marketingAutomation: false,
    transactionalDelivery: false,
    domainAuthenticationConfirmed: false,
    senderEmailCommittedToRepository: false,
    replyToEmailCommittedToRepository: false
  },
  requiredRuntimeSecrets: ['BREVO_API_KEY','EMAIL_WEBHOOK_SECRET','ADMIN_API_TOKEN'],
  requiredRuntimeVariablesAfterDNSApproval: ['MEMBERS_FROM_EMAIL','MEMBERS_REPLY_TO_EMAIL','BREVO_DOMAIN_AUTHENTICATED=true','EMAIL_TRANSACTIONAL_ENABLED=true'],
  externalSteps,
  boundary: 'The repository may prove code and fail-closed switches, but only Brevo and DNS can prove sender-domain authentication and real inbox delivery.'
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (!codeReady) throw new Error(`Brevo operational readiness audit failed: ${JSON.stringify(checks)}`);
console.log('Brevo operational readiness audit passed: code ready, transactional sending and marketing remain disabled pending authenticated domain and inbox tests.');
