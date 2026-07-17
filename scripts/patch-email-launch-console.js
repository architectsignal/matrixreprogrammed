const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'email-launch-console-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

const oldRoutes = "  '/api/email/admin/campaigns','/api/email/admin/process-outbox','/api/email/admin/run-automation'";
const testRoutes = "  '/api/email/admin/campaigns','/api/email/admin/process-outbox','/api/email/admin/run-automation','/api/email/admin/test-transactional'";
const newRoutes = "  '/api/email/admin/campaigns','/api/email/admin/process-outbox','/api/email/admin/run-automation','/api/email/admin/test-transactional','/api/email/admin/quarantine-retries'";
if (!source.includes(newRoutes)) {
  if (source.includes(testRoutes)) source = source.replace(testRoutes, newRoutes);
  else if (source.includes(oldRoutes)) source = source.replace(oldRoutes, newRoutes);
  else throw new Error('Email launch console route registry target not found');
  changed = true;
}

const automationAnchor = "async function handleAdminAutomation(request,env){if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);const input=await body(request);const kind=clean(input.kind||'daily',20);if(!['daily','weekly'].includes(kind))return json({ok:false,error:'Kind must be daily or weekly'},400);return json({ok:true,result:await automatedCampaign(request,env,kind)}}";
const testHandler = `async function handleAdminTransactionalTest(request,env){
  if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);
  const readiness=await adminHealth(env);
  const recipient=clean(env?.EMAIL_TEST_RECIPIENT||env?.MEMBERS_REPLY_TO_EMAIL,254);
  if(!validEmail(recipient))return json({ok:false,error:'Configure EMAIL_TEST_RECIPIENT or MEMBERS_REPLY_TO_EMAIL before sending a controlled test',readiness:{transactionalConfigurationReady:readiness.transactionalConfigurationReady,transactionalEnabled:readiness.transactionalEnabled,domainAuthenticated:readiness.domainAuthenticated}},409);
  if(!readiness.transactionalConfigurationReady||!readiness.transactionalEnabled)return json({ok:false,error:'Transactional delivery is not launch-ready',readiness:{transactionalConfigurationReady:readiness.transactionalConfigurationReady,transactionalEnabled:readiness.transactionalEnabled,domainAuthenticated:readiness.domainAuthenticated,sender:readiness.sender}},409);
  const stamp=iso(env);
  const payload={to:{email:recipient,name:clean(env?.MEMBERS_REPLY_TO_NAME||'Matrix Reprogrammed Test',120)},subject:\`Matrix Reprogrammed transactional test — \${stamp.slice(0,19)}\`,htmlContent:\`<!doctype html><html><body><h1>Transactional email test</h1><p>This controlled message proves the authenticated Matrix Reprogrammed sender, reply-to identity and Brevo API delivery path.</p><p>Generated: \${html(stamp)}</p><p>No marketing campaign was activated.</p></body></html>\`,textContent:\`Transactional email test\\n\\nThis controlled message proves the authenticated Matrix Reprogrammed sender, reply-to identity and Brevo API delivery path.\\n\\nGenerated: \${stamp}\\nNo marketing campaign was activated.\`,headers:{'X-Matrix-Test':'transactional-readiness'}};
  const delivery=await sendProviderEmail(env,payload);
  await audit(env,'admin','email.transactional_test','email_provider','brevo',{sent:delivery.sent,status:delivery.status||null,messageId:Boolean(delivery.messageId),recipientHash:await emailHash(recipient)});
  return json({ok:delivery.sent===true,sent:delivery.sent===true,status:delivery.status||null,messageId:delivery.messageId||null,recipientConfigured:true,recipientMasked:recipient.replace(/^(.{1,2}).*(@.*)$/,'$1***$2'),marketingAutomationEnabled:automationEnabled(env),transactionalEnabled:transactionalEnabled(env),domainAuthenticated:domainAuthenticated(env),message:delivery.sent?'Controlled transactional test accepted by Brevo.':'Brevo did not accept the controlled test.',error:delivery.error||null},delivery.sent?200:502);
}

`;
if (!source.includes('async function handleAdminTransactionalTest')) {
  if (!source.includes(automationAnchor)) throw new Error('Email launch console transactional handler insertion target not found');
  source = source.replace(automationAnchor, `${testHandler}${automationAnchor}`);
  changed = true;
}

const quarantineHandler = `async function handleAdminQuarantineRetries(request,env){
  if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);
  if(automationEnabled(env))return json({ok:false,error:'Disable EMAIL_AUTOMATION_ENABLED before quarantining retries'},409);
  const input=await body(request);
  if(clean(input.confirm||'',80)!=='QUARANTINE_PREACTIVATION_RETRIES')return json({ok:false,error:'Explicit quarantine confirmation is required'},400);
  await ensureSchema(env);
  const requestedCutoff=clean(input.before||iso(env),80);
  if(!Number.isFinite(Date.parse(requestedCutoff)))return json({ok:false,error:'A valid ISO cutoff time is required'},400);
  const cutoff=new Date(requestedCutoff).toISOString();
  const rows=await all(env.MEMBERS_DB.prepare(\`SELECT id,member_id,campaign_id,message_kind,attempt_count,created_at,last_error FROM email_outbox WHERE status='retry' AND created_at<? ORDER BY created_at\`).bind(cutoff));
  const stamp=iso(env);
  const byKind={};
  const campaignIds=new Set();
  for(const row of rows){
    const kind=clean(row.message_kind||'unknown',80)||'unknown';
    byKind[kind]=Number(byKind[kind]||0)+1;
    if(row.campaign_id)campaignIds.add(row.campaign_id);
    const previous=clean(row.last_error||'',300);
    const reason=\`Quarantined before newsletter activation at \${stamp}\${previous?\`: \${previous}\`:''}\`;
    await env.MEMBERS_DB.prepare(\`UPDATE email_outbox SET status='quarantined',locked_at=NULL,last_error=?,updated_at=? WHERE id=? AND status='retry'\`).bind(reason,stamp,row.id).run();
    if(row.campaign_id)await env.MEMBERS_DB.prepare(\`UPDATE email_deliveries SET status='failed',failed_at=COALESCE(failed_at,?),failure_reason='quarantined-pre-activation-retry',last_event_at=?,updated_at=? WHERE campaign_id=? AND member_id=? AND status IN ('queued','deferred')\`).bind(stamp,stamp,stamp,row.campaign_id,row.member_id).run();
  }
  for(const campaignId of campaignIds)await refreshCampaign(env,campaignId);
  await audit(env,'admin','email.outbox.legacy_retries_quarantined','email_outbox','legacy-retry-batch',{before:cutoff,count:rows.length,byKind,campaignCount:campaignIds.size});
  return json({ok:true,quarantined:rows.length,before:cutoff,byKind,campaignsRefreshed:campaignIds.size,automationEnabled:automationEnabled(env),message:rows.length?'Pre-activation retry messages were quarantined and will not be sent.':'No retry messages matched the cutoff.'});
}

`;
if (!source.includes('async function handleAdminQuarantineRetries')) {
  if (!source.includes(automationAnchor)) throw new Error('Email launch console quarantine handler insertion target not found');
  source = source.replace(automationAnchor, `${quarantineHandler}${automationAnchor}`);
  changed = true;
}

const baseDispatch = "if(request.method==='POST'&&path==='/api/email/admin/run-automation')return handleAdminAutomation(request,env);return json({ok:false,error:'Method not allowed'},405)";
const testDispatch = "if(request.method==='POST'&&path==='/api/email/admin/run-automation')return handleAdminAutomation(request,env);if(request.method==='POST'&&path==='/api/email/admin/test-transactional')return handleAdminTransactionalTest(request,env);return json({ok:false,error:'Method not allowed'},405)";
const newDispatch = "if(request.method==='POST'&&path==='/api/email/admin/run-automation')return handleAdminAutomation(request,env);if(request.method==='POST'&&path==='/api/email/admin/test-transactional')return handleAdminTransactionalTest(request,env);if(request.method==='POST'&&path==='/api/email/admin/quarantine-retries')return handleAdminQuarantineRetries(request,env);return json({ok:false,error:'Method not allowed'},405)";
if (!source.includes(newDispatch)) {
  if (source.includes(testDispatch)) source = source.replace(testDispatch, newDispatch);
  else if (source.includes(baseDispatch)) source = source.replace(baseDispatch, newDispatch);
  else throw new Error('Email launch console dispatch target not found');
  changed = true;
}

for (const marker of [
  '/api/email/admin/test-transactional',
  'async function handleAdminTransactionalTest',
  'EMAIL_TEST_RECIPIENT||env?.MEMBERS_REPLY_TO_EMAIL',
  "'X-Matrix-Test':'transactional-readiness'",
  'email.transactional_test',
  'No marketing campaign was activated.',
  '/api/email/admin/quarantine-retries',
  'async function handleAdminQuarantineRetries',
  'QUARANTINE_PREACTIVATION_RETRIES',
  "status='quarantined'",
  'email.outbox.legacy_retries_quarantined'
]) if (!source.includes(marker)) throw new Error(`Email launch console marker missing: ${marker}`);

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  transactionalTestRoute: '/api/email/admin/test-transactional',
  retryQuarantineRoute: '/api/email/admin/quarantine-retries',
  authentication: 'X-Admin-Token required',
  recipientPolicy: 'Server-configured EMAIL_TEST_RECIPIENT or MEMBERS_REPLY_TO_EMAIL only; no client-selected recipient.',
  quarantinePolicy: 'Explicit confirmation, automation-off gate, ISO cutoff, no recipient addresses returned, audit logged.',
  requiredState: ['transactionalConfigurationReady=true','EMAIL_TRANSACTIONAL_ENABLED=true','BREVO_DOMAIN_AUTHENTICATED=true'],
  marketingAutomationUnaffected: true,
  auditLogged: true
}, null, 2)}\n`);
console.log(`Controlled email launch and retry quarantine endpoints ${changed ? 'installed' : 'already current'}.`);
