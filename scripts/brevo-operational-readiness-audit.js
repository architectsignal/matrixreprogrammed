const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const rendererPath = path.join(root, 'src', 'worker-daily-brief-email.js');
const tomlPath = path.join(root, 'wrangler.toml');
const jsoncPath = path.join(root, 'wrangler.jsonc');
const outputPath = path.join(root, 'downloads', 'brevo-operational-readiness.json');

for (const file of [workerPath, rendererPath, tomlPath, jsoncPath]) if (!fs.existsSync(file)) throw new Error(`Brevo readiness source missing: ${path.relative(root, file)}`);
const worker = fs.readFileSync(workerPath, 'utf8');
const renderer = fs.readFileSync(rendererPath, 'utf8');
const toml = fs.readFileSync(tomlPath, 'utf8');
const jsonc = fs.readFileSync(jsoncPath, 'utf8');

function both(tomlPattern, jsoncPattern) { return tomlPattern.test(toml) && jsoncPattern.test(jsonc); }
const codeChecks = {
  emailLifecycleD1Authoritative: worker.includes("X-Matrix-Origin':'cloudflare-worker-email-lifecycle") && worker.includes('MEMBERS_DB'),
  explicitConsentRequired: worker.includes('Explicit email consent is required') && worker.includes("marketing_status='subscribed'"),
  verifiedRecipientsOnly: worker.includes('email_verified_at IS NOT NULL'),
  preferenceSegmentRequired: worker.includes('email_preferences') && worker.includes('segmentKey'),
  suppressionRequired: worker.includes('email_suppressions') && worker.includes('handleUnsubscribe'),
  verificationTokensPresent: worker.includes("'verify_marketing'") && worker.includes('email_action_tokens'),
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
  weeklyCampaignSourceReady: worker.includes('/downloads/weekly-investigation-report.json') || worker.includes('/data/weekly-investigation-conclusions.json'),
  deepStructuredRenderer: ['Trigger','Primary record','Record status','Established facts','Key entities','Money and authority','Mechanism of power','Solid conclusion','Mission relevance','Elite-control relevance','Global convergence assessment','Speculative conclusion','Counter-analysis','Missing evidence','Watch next','Access tier'].every(marker => renderer.includes(marker)),
  failClosedSourceFallback: renderer.includes('No verified source changes were available') || renderer.includes('No evidence-graded briefings were available'),
  immediateFirstBrief: worker.includes('queueImmediateDailyBrief') && worker.includes("messageKind:'first_daily_brief'") && worker.includes('public_daily_brief!==1'),
  perRecipientPreferenceAndUnsubscribe: worker.includes('subscriber-dashboard.html?token=') && worker.includes('/api/email/unsubscribe?token='),
  listUnsubscribeHeaders: worker.includes("'List-Unsubscribe'") && worker.includes("'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'"),
  reusableMarketingActionLinks: worker.includes('issueReusableEmailToken') || worker.includes("const reusable=['preferences','unsubscribe'].includes(purpose)"),
  campaignIdempotency: worker.includes('campaignKey:`automation:${kind}:${date}:v3`') && worker.includes('daily-control-brief:${member.id}:') && worker.includes("campaign.kind==='daily'") && worker.includes('`${campaign.id}:${member.id}`'),
  zeroRecipientCampaignCompletion: worker.includes("const status=recipients.length?'sending':'sent'") || worker.includes("status='sending'"),
  parisLocalTimeGuard: worker.includes("timeZone:'Europe/Paris'") && worker.includes("parts.hour==='08'&&parts.minute==='05'") && worker.includes("parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'")
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
  dailySummerCronConfigured: both(/"5 6 \* \* \*"/, /"5 6 \* \* \*"/),
  dailyWinterCronConfigured: both(/"5 7 \* \* \*"/, /"5 7 \* \* \*"/),
  weeklySummerCronConfigured: both(/"15 7 \* \* 1"/, /"15 7 \* \* 1"/),
  weeklyWinterCronConfigured: both(/"15 8 \* \* 1"/, /"15 8 \* \* 1"/)
};

const codeReady = Object.values(codeChecks).every(Boolean);
const configurationReady = Object.values(configurationChecks).every(Boolean);
const checks = { ...codeChecks, ...configurationChecks };
const status = !codeReady ? 'code-not-ready' : configurationReady ? 'consent-controlled-automation-ready' : 'configuration-inconsistent';

const report = {
  ok: codeReady && configurationReady,
  generatedAt: new Date().toISOString(),
  phase: 3,
  status,
  checks,
  currentSafetyState: {
    marketingAutomation: configurationChecks.marketingAutomationOn,
    consentRequired: codeChecks.explicitConsentRequired,
    verifiedRecipientsOnly: codeChecks.verifiedRecipientsOnly,
    preferenceRequired: codeChecks.preferenceSegmentRequired,
    suppressionRequired: codeChecks.suppressionRequired,
    transactionalDelivery: configurationChecks.transactionalDeliveryOn,
    domainAuthenticationConfirmed: configurationChecks.domainAuthenticationConfirmed,
    senderEmail: configurationChecks.senderEmailConfigured ? 'members@matrixreprogrammed.com' : null,
    replyToEmail: configurationChecks.replyToEmailConfigured ? 'njmgroupfrance@gmail.com' : null,
    retryQuarantineBefore: configurationChecks.retryQuarantineCutoffConfigured ? '2026-07-18T00:00:00.000Z' : null,
    dailyCampaignSource: codeChecks.dailyCampaignSourceReady ? '/data/daily-brain-brief.json' : null,
    weeklyCampaignSource: codeChecks.weeklyCampaignSourceReady ? 'weekly investigation source bundle' : null,
    structureVersion: codeChecks.deepStructuredRenderer ? 3 : null,
    immediateFirstBrief: codeChecks.immediateFirstBrief,
    perRecipientUnsubscribe: codeChecks.perRecipientPreferenceAndUnsubscribe && codeChecks.listUnsubscribeHeaders,
    campaignIdempotency: codeChecks.campaignIdempotency
  },
  schedules: {
    active: configurationChecks.marketingAutomationOn,
    localDecisionZone: 'Europe/Paris',
    dailyLocal: '08:05',
    weeklyLocal: 'Monday 09:15',
    utcCandidates: { daily: ['06:05','07:05'], weeklyMonday: ['07:15','08:15'] },
    duplicatePrevention: 'The Worker sends only when Europe/Paris local time matches. Immediate and scheduled Daily Briefs share a member/date key; other campaigns retain campaign/member keys.'
  },
  requiredRuntimeSecrets: ['BREVO_API_KEY','EMAIL_WEBHOOK_SECRET','ADMIN_API_TOKEN'],
  operatingRequirements: [
    'Deliver only to verified, explicitly subscribed and unsuppressed recipients whose selected preference matches the campaign.',
    'Preserve personalised preference and one-click unsubscribe routes on every campaign.',
    'Preserve fact, analysis, speculation, counter-analysis and missing-evidence boundaries.',
    'Review delivery, bounce, complaint, click and unsubscribe events in D1 and Brevo.'
  ],
  boundary: 'Automated daily and weekly briefing delivery is authorised only through the verified consent, preference, suppression, evidence-quality, idempotency and Europe/Paris scheduling controls audited here.'
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Brevo operational readiness audit failed: ${status} ${JSON.stringify({ codeChecks, configurationChecks })}`);
console.log(`Brevo operational readiness audit passed: ${status}.`);
