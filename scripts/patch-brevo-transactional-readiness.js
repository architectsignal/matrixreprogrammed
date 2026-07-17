const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'brevo-transactional-readiness-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

const automationLine = "function automationEnabled(env){return String(env?.EMAIL_AUTOMATION_ENABLED||'').toLowerCase()==='true'}";
const transactionalLine = `${automationLine}\nfunction transactionalEnabled(env){return String(env?.EMAIL_TRANSACTIONAL_ENABLED||'').toLowerCase()==='true'}\nfunction domainAuthenticated(env){return String(env?.BREVO_DOMAIN_AUTHENTICATED||'').toLowerCase()==='true'}`;
if (!source.includes('function transactionalEnabled(env)')) {
  if (!source.includes(automationLine)) throw new Error('Email automation helper anchor not found');
  source = source.replace(automationLine, transactionalLine);
  changed = true;
}

const oldProviderGuard = "if(!providerConfigured(env))return{configured:false,sent:false,error:'Brevo transactional delivery is not configured'};";
const newProviderGuard = "if(!providerConfigured(env))return{configured:false,sent:false,error:'Brevo transactional delivery is not configured'};if(!transactionalEnabled(env))return{configured:true,sent:false,error:'Transactional email delivery is disabled until Phase 2 readiness is approved'};if(!domainAuthenticated(env))return{configured:true,sent:false,error:'Brevo sender domain authentication has not been confirmed'};";
if (!source.includes(newProviderGuard)) {
  if (!source.includes(oldProviderGuard)) throw new Error('Brevo provider guard target not found');
  source = source.replace(oldProviderGuard, newProviderGuard);
  changed = true;
}

const oldPayload = "body:JSON.stringify({sender:{email:String(env.MEMBERS_FROM_EMAIL),name:String(env.MEMBERS_FROM_NAME||'Matrix Reprogrammed')},to:[payload.to],subject:checked.subject,htmlContent:checked.htmlContent,textContent:checked.textContent,headers:payload.headers||undefined})";
const newPayload = "body:JSON.stringify({sender:{email:String(env.MEMBERS_FROM_EMAIL),name:String(env.MEMBERS_FROM_NAME||'Matrix Reprogrammed')},replyTo:env.MEMBERS_REPLY_TO_EMAIL?{email:String(env.MEMBERS_REPLY_TO_EMAIL),name:String(env.MEMBERS_REPLY_TO_NAME||env.MEMBERS_FROM_NAME||'Matrix Reprogrammed')}:undefined,to:[payload.to],subject:checked.subject,htmlContent:checked.htmlContent,textContent:checked.textContent,headers:payload.headers||undefined})";
if (!source.includes(newPayload)) {
  if (!source.includes(oldPayload)) throw new Error('Brevo send payload target not found');
  source = source.replace(oldPayload, newPayload);
  changed = true;
}

const oldHealth = "return{ok:true,d1Connected:true,schemaReady:true,brevoConfigured:providerConfigured(env),automationEnabled:automationEnabled(env),memberCounts,outbox,campaigns,events,provider,requiredSecrets:{brevoApiKey:Boolean(env?.BREVO_API_KEY),fromEmail:Boolean(env?.MEMBERS_FROM_EMAIL),webhookSecret:Boolean(env?.EMAIL_WEBHOOK_SECRET),adminToken:Boolean(env?.ADMIN_API_TOKEN)}}";
const newHealth = "const senderEmail=clean(env?.MEMBERS_FROM_EMAIL,254);const replyToEmail=clean(env?.MEMBERS_REPLY_TO_EMAIL,254);const configurationReady=providerConfigured(env)&&validEmail(senderEmail)&&validEmail(replyToEmail)&&Boolean(env?.EMAIL_WEBHOOK_SECRET)&&Boolean(env?.ADMIN_API_TOKEN)&&domainAuthenticated(env);return{ok:true,d1Connected:true,schemaReady:true,brevoConfigured:providerConfigured(env),domainAuthenticated:domainAuthenticated(env),transactionalConfigurationReady:configurationReady,transactionalEnabled:transactionalEnabled(env),transactionalLive:configurationReady&&transactionalEnabled(env),automationEnabled:automationEnabled(env),sender:{fromEmailConfigured:validEmail(senderEmail),fromNameConfigured:Boolean(clean(env?.MEMBERS_FROM_NAME,120)),replyToEmailConfigured:validEmail(replyToEmail),replyToNameConfigured:Boolean(clean(env?.MEMBERS_REPLY_TO_NAME,120)),temporaryBrevoDomain:/\\.brevosend\\.com$/i.test(senderEmail)},memberCounts,outbox,campaigns,events,provider,requiredSecrets:{brevoApiKey:Boolean(env?.BREVO_API_KEY),fromEmail:Boolean(env?.MEMBERS_FROM_EMAIL),fromName:Boolean(env?.MEMBERS_FROM_NAME),replyToEmail:Boolean(env?.MEMBERS_REPLY_TO_EMAIL),replyToName:Boolean(env?.MEMBERS_REPLY_TO_NAME),domainAuthenticated:domainAuthenticated(env),transactionalEnabled:transactionalEnabled(env),webhookSecret:Boolean(env?.EMAIL_WEBHOOK_SECRET),adminToken:Boolean(env?.ADMIN_API_TOKEN)}}";
if (!source.includes('transactionalConfigurationReady:configurationReady')) {
  if (!source.includes(oldHealth)) throw new Error('Email admin health readiness target not found');
  source = source.replace(oldHealth, newHealth);
  changed = true;
}

for (const marker of [
  'function transactionalEnabled(env)',
  'function domainAuthenticated(env)',
  'Transactional email delivery is disabled until Phase 2 readiness is approved',
  'Brevo sender domain authentication has not been confirmed',
  'replyTo:env.MEMBERS_REPLY_TO_EMAIL',
  'transactionalConfigurationReady:configurationReady',
  'temporaryBrevoDomain'
]) if (!source.includes(marker)) throw new Error(`Brevo readiness marker missing: ${marker}`);

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  transactionalDeliveryDefault: 'disabled',
  requiredConfiguration: ['BREVO_API_KEY','MEMBERS_FROM_EMAIL','MEMBERS_FROM_NAME','MEMBERS_REPLY_TO_EMAIL','MEMBERS_REPLY_TO_NAME','EMAIL_WEBHOOK_SECRET','ADMIN_API_TOKEN','BREVO_DOMAIN_AUTHENTICATED=true','EMAIL_TRANSACTIONAL_ENABLED=true'],
  marketingAutomationRequiredState: 'EMAIL_AUTOMATION_ENABLED=false until the newsletter phase is approved',
  replyToSupport: true,
  temporaryBrevoSenderRejectedAsLaunchReady: true,
  boundary: 'Transactional delivery remains disabled until the authenticated sender domain, reply-to identity, webhook secret, admin token and explicit activation switch are all present.'
}, null, 2)}\n`);
console.log(`Brevo transactional readiness ${changed ? 'installed' : 'already current'}: authenticated domain and explicit activation required, reply-to enabled, marketing automation remains separate.`);
