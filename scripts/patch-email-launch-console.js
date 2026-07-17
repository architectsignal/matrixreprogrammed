const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'email-launch-console-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

function ensureRoute(route) {
  const start = source.indexOf('const emailRoutes=new Set([');
  if (start < 0) throw new Error('Email route registry start not found');
  const end = source.indexOf(']);', start);
  if (end < 0) throw new Error('Email route registry end not found');
  const registry = source.slice(start, end);
  if (registry.includes(`'${route}'`)) return;
  const before = source.slice(0, end).replace(/\s+$/, '');
  const separator = before.endsWith(',') ? '' : ',';
  source = `${before}${separator}\n  '${route}'${source.slice(end)}`;
  changed = true;
}

function insertHandler(marker, block) {
  if (source.includes(marker)) return;
  const anchor = 'async function fetchHandler(';
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Email launch console handler insertion anchor missing for ${marker}`);
  source = `${source.slice(0, index)}${block}\n${source.slice(index)}`;
  changed = true;
}

function ensureDispatch(route, handler) {
  const routeMarker = `path==='${route}'`;
  if (source.includes(routeMarker)) return;
  const fetchStart = source.indexOf('async function fetchHandler(');
  if (fetchStart < 0) throw new Error(`Email launch console fetch handler missing for ${route}`);
  const returnMarker = "return json({ok:false,error:'Method not allowed'},405)";
  const index = source.indexOf(returnMarker, fetchStart);
  if (index < 0) throw new Error(`Email launch console dispatch insertion target missing for ${route}`);
  const dispatch = `if(request.method==='POST'&&path==='${route}')return ${handler}(request,env);`;
  source = `${source.slice(0, index)}${dispatch}${source.slice(index)}`;
  changed = true;
}

ensureRoute('/api/email/admin/test-transactional');
ensureRoute('/api/email/admin/quarantine-retries');

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
}`;
insertHandler('async function handleAdminTransactionalTest', testHandler);

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
}`;
insertHandler('async function handleAdminQuarantineRetries', quarantineHandler);

ensureDispatch('/api/email/admin/test-transactional', 'handleAdminTransactionalTest');
ensureDispatch('/api/email/admin/quarantine-retries', 'handleAdminQuarantineRetries');

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
  patchStrategy: 'structural route, handler and dispatch insertion; independent of minified function body shape',
  transactionalTestRoute: '/api/email/admin/test-transactional',
  retryQuarantineRoute: '/api/email/admin/quarantine-retries',
  authentication: 'X-Admin-Token required',
  recipientPolicy: 'Server-configured EMAIL_TEST_RECIPIENT or MEMBERS_REPLY_TO_EMAIL only; no client-selected recipient.',
  quarantinePolicy: 'Explicit confirmation, automation-off gate, ISO cutoff, no recipient addresses returned, audit logged.',
  requiredState: ['transactionalConfigurationReady=true','EMAIL_TRANSACTIONAL_ENABLED=true','BREVO_DOMAIN_AUTHENTICATED=true'],
  marketingAutomationUnaffected: true,
  repeatSafe: true,
  auditLogged: true
}, null, 2)}\n`);
console.log(`Controlled email launch and retry quarantine endpoints ${changed ? 'installed' : 'already current'}.`);
