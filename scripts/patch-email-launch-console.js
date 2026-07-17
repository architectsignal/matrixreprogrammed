const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'email-launch-console-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

const oldRoutes = "  '/api/email/admin/campaigns','/api/email/admin/process-outbox','/api/email/admin/run-automation'";
const newRoutes = "  '/api/email/admin/campaigns','/api/email/admin/process-outbox','/api/email/admin/run-automation','/api/email/admin/test-transactional'";
if (!source.includes(newRoutes)) {
  if (!source.includes(oldRoutes)) throw new Error('Email launch console route registry target not found');
  source = source.replace(oldRoutes, newRoutes);
  changed = true;
}

const automationAnchor = "async function handleAdminAutomation(request,env){if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);const input=await body(request);const kind=clean(input.kind||'daily',20);if(!['daily','weekly'].includes(kind))return json({ok:false,error:'Kind must be daily or weekly'},400);return json({ok:true,result:await automatedCampaign(request,env,kind)})}";
const testHandler = `async function handleAdminTransactionalTest(request,env){
  if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);
  const readiness=await adminHealth(env);
  const recipient=clean(env?.EMAIL_TEST_RECIPIENT||env?.MEMBERS_REPLY_TO_EMAIL,254);
  if(!validEmail(recipient))return json({ok:false,error:'Configure EMAIL_TEST_RECIPIENT or MEMBERS_REPLY_TO_EMAIL before sending a controlled test',readiness:{transactionalConfigurationReady:readiness.transactionalConfigurationReady,transactionalEnabled:readiness.transactionalEnabled,domainAuthenticated:readiness.domainAuthenticated}},409);
  if(!readiness.transactionalConfigurationReady||!readiness.transactionalEnabled)return json({ok:false,error:'Transactional delivery is not launch-ready',readiness:{transactionalConfigurationReady:readiness.transactionalConfigurationReady,transactionalEnabled:readiness.transactionalEnabled,domainAuthenticated:readiness.domainAuthenticated,sender:readiness.sender}},409);
  const stamp=iso(env);
  const payload={to:{email:recipient,name:clean(env?.MEMBERS_REPLY_TO_NAME||'Matrix Reprogrammed Test',120)},subject:\`Matrix Reprogrammed transactional test — ${'${stamp.slice(0,19)}'}\`,htmlContent:\`<!doctype html><html><body><h1>Transactional email test</h1><p>This controlled message proves the authenticated Matrix Reprogrammed sender, reply-to identity and Brevo API delivery path.</p><p>Generated: ${'${html(stamp)}'}</p><p>No marketing campaign was activated.</p></body></html>\`,textContent:\`Transactional email test\\n\\nThis controlled message proves the authenticated Matrix Reprogrammed sender, reply-to identity and Brevo API delivery path.\\n\\nGenerated: ${'${stamp}'}\\nNo marketing campaign was activated.\`,headers:{'X-Matrix-Test':'transactional-readiness'}};
  const delivery=await sendProviderEmail(env,payload);
  await audit(env,'admin','email.transactional_test','email_provider','brevo',{sent:delivery.sent,status:delivery.status||null,messageId:Boolean(delivery.messageId),recipientHash:await emailHash(recipient)});
  return json({ok:delivery.sent===true,sent:delivery.sent===true,status:delivery.status||null,messageId:delivery.messageId||null,recipientConfigured:true,recipientMasked:recipient.replace(/^(.{1,2}).*(@.*)$/,'$1***$2'),marketingAutomationEnabled:automationEnabled(env),transactionalEnabled:transactionalEnabled(env),domainAuthenticated:domainAuthenticated(env),message:delivery.sent?'Controlled transactional test accepted by Brevo.':'Brevo did not accept the controlled test.',error:delivery.error||null},delivery.sent?200:502);
}

${automationAnchor}`;
if (!source.includes('async function handleAdminTransactionalTest')) {
  if (!source.includes(automationAnchor)) throw new Error('Email launch console handler insertion target not found');
  source = source.replace(automationAnchor, testHandler);
  changed = true;
}

const oldDispatch = "if(request.method==='POST'&&path==='/api/email/admin/run-automation')return handleAdminAutomation(request,env);return json({ok:false,error:'Method not allowed'},405)";
const newDispatch = "if(request.method==='POST'&&path==='/api/email/admin/run-automation')return handleAdminAutomation(request,env);if(request.method==='POST'&&path==='/api/email/admin/test-transactional')return handleAdminTransactionalTest(request,env);return json({ok:false,error:'Method not allowed'},405)";
if (!source.includes(newDispatch)) {
  if (!source.includes(oldDispatch)) throw new Error('Email launch console dispatch target not found');
  source = source.replace(oldDispatch, newDispatch);
  changed = true;
}

for (const marker of [
  '/api/email/admin/test-transactional',
  'async function handleAdminTransactionalTest',
  'EMAIL_TEST_RECIPIENT||env?.MEMBERS_REPLY_TO_EMAIL',
  "'X-Matrix-Test':'transactional-readiness'",
  "email.transactional_test",
  'No marketing campaign was activated.'
]) if (!source.includes(marker)) throw new Error(`Email launch console marker missing: ${marker}`);

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  route: '/api/email/admin/test-transactional',
  authentication: 'X-Admin-Token required',
  recipientPolicy: 'Server-configured EMAIL_TEST_RECIPIENT or MEMBERS_REPLY_TO_EMAIL only; no client-selected recipient.',
  requiredState: ['transactionalConfigurationReady=true','EMAIL_TRANSACTIONAL_ENABLED=true','BREVO_DOMAIN_AUTHENTICATED=true'],
  marketingAutomationUnaffected: true,
  auditLogged: true
}, null, 2)}\n`);
console.log(`Controlled email launch console endpoint ${changed ? 'installed' : 'already current'}.`);
