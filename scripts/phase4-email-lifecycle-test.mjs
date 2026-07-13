import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
const outputDir=path.join(root,'downloads','phase4-email-lifecycle-test');
fs.rmSync(outputDir,{recursive:true,force:true});
fs.mkdirSync(outputDir,{recursive:true});

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value}
function writeJson(name,value){fs.writeFileSync(path.join(outputDir,name),JSON.stringify(stable(value),null,2)+'\n')}
function assert(condition,message){if(!condition)throw new Error(message)}
function scalar(db,sql,...args){const row=db.prepare(sql).get(...args);return row?Object.values(row)[0]:null}
function rows(db,sql,...args){return db.prepare(sql).all(...args)}
function hashFile(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}

class D1Statement{
  constructor(database,sql){this.database=database;this.sql=sql;this.args=[]}
  bind(...args){this.args=args;return this}
  async run(){const statement=this.database.prepare(this.sql);const result=statement.run(...this.args);return{success:true,meta:{changes:Number(result.changes||0),last_row_id:result.lastInsertRowid?String(result.lastInsertRowid):null}}}
  async first(){const statement=this.database.prepare(this.sql);return statement.get(...this.args)||null}
  async all(){const statement=this.database.prepare(this.sql);return{success:true,results:statement.all(...this.args)}}
}
class D1Database{
  constructor(database){this.database=database}
  prepare(sql){return new D1Statement(this.database,sql)}
  async batch(statements){const results=[];this.database.exec('BEGIN');try{for(const statement of statements)results.push(await statement.run());this.database.exec('COMMIT');return results}catch(error){this.database.exec('ROLLBACK');throw error}}
}

function seedBaseSchema(db){db.exec(`
PRAGMA foreign_keys=ON;
CREATE TABLE members (
  id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT 'member',tier TEXT NOT NULL DEFAULT 'free',status TEXT NOT NULL DEFAULT 'pending',marketing_status TEXT NOT NULL DEFAULT 'pending',source TEXT NOT NULL DEFAULT '',email_verified_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_login_at TEXT
);
CREATE TABLE email_consents (
  id TEXT PRIMARY KEY,member_id TEXT NOT NULL,consent_type TEXT NOT NULL,granted INTEGER NOT NULL,wording_version TEXT NOT NULL,source_page TEXT NOT NULL,granted_at TEXT,withdrawn_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE TABLE magic_links (id TEXT PRIMARY KEY,member_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,purpose TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE TABLE member_sessions (id TEXT PRIMARY KEY,member_id TEXT NOT NULL,session_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,revoked_at TEXT,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE TABLE subscriptions (id TEXT PRIMARY KEY,member_id TEXT NOT NULL,provider TEXT,provider_subscription_id TEXT,provider_plan_id TEXT,tier TEXT,status TEXT,next_billing_at TEXT,current_period_end TEXT,cancel_at_period_end INTEGER DEFAULT 0,updated_at TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE TABLE audit_log (id TEXT PRIMARY KEY,actor_id TEXT,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
`)}

const db=new DatabaseSync(':memory:');
db.function('sha3',(value,bits)=>crypto.createHash('sha256').update(String(value)).digest());
seedBaseSchema(db);
db.exec(fs.readFileSync(path.join(root,'migrations/phase4_email_lifecycle.sql'),'utf8'));
db.exec(fs.readFileSync(path.join(root,'migrations/phase4_email_lifecycle_portability.sql'),'utf8'));
const d1=new D1Database(db);

const workerSource=fs.readFileSync(path.join(root,'src/worker-email-lifecycle.js'),'utf8');
const workerModule=await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const worker=workerModule.default;

const providerCalls=[];
let providerMessageCounter=0;
let providerFailure=false;
async function providerFetch(url,options={}){
  const payload=options.body?JSON.parse(options.body):null;
  providerCalls.push({url,method:options.method||'GET',payload});
  if(providerFailure)return new Response(JSON.stringify({message:'fixture provider failure'}),{status:503,headers:{'content-type':'application/json'}});
  if(url.endsWith('/v3/contacts'))return new Response(JSON.stringify({id:9001}),{status:201,headers:{'content-type':'application/json'}});
  if(url.endsWith('/v3/smtp/email')){providerMessageCounter+=1;return new Response(JSON.stringify({messageId:`brevo-test-message-${providerMessageCounter}`}),{status:201,headers:{'content-type':'application/json'}})}
  return new Response(JSON.stringify({message:'unexpected provider path'}),{status:404,headers:{'content-type':'application/json'}});
}
const assets={async fetch(request){const pathname=new URL(request.url).pathname;if(pathname.includes('weekly'))return new Response(JSON.stringify({generatedAt:'2026-07-13T10:00:00.000Z',records:[{canonicalId:'weekly-1',title:'Weekly evidence change',summary:'A verified public-record change entered the weekly review queue.'}]}),{status:200,headers:{'content-type':'application/json'}});if(pathname.includes('daily')||pathname.includes('live-intel'))return new Response(JSON.stringify({generatedAt:'2026-07-13T10:00:00.000Z',records:[{canonicalId:'daily-1',title:'Daily evidence update',summary:'A sourced daily record changed and retained its evidence boundary.'}]}),{status:200,headers:{'content-type':'application/json'}});return new Response('not found',{status:404})}};
const env={
  MEMBERS_DB:d1,
  BREVO_API_KEY:'brevo-fixture-key',
  MEMBERS_FROM_EMAIL:'briefs@matrixreprogrammed.com',
  MEMBERS_FROM_NAME:'Matrix Reprogrammed',
  EMAIL_PROVIDER_FETCH:providerFetch,
  EMAIL_TEST_MODE:'true',
  EMAIL_TEST_NOW:'2026-07-13T12:00:00.000Z',
  EMAIL_AUTOMATION_ENABLED:'true',
  EMAIL_WEBHOOK_SECRET:'webhook-fixture-secret',
  ADMIN_API_TOKEN:'admin-fixture-token',
  ASSETS:assets
};
const adminHeaders={'x-admin-token':env.ADMIN_API_TOKEN};
const lifecycle=[];
async function call(pathname,{method='GET',body,headers={}}={}){const request=new Request(`https://matrixreprogrammed.com${pathname}`,{method,headers:body?{'content-type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined});const response=await worker.fetch(request,env,{});let data=null;const text=await response.text();try{data=JSON.parse(text||'null')}catch{data=text}return{response,data}}
function pass(name,details={}){lifecycle.push({name,passed:true,...details})}

const signup=await call('/newsletter-signup',{method:'POST',body:{email:'clean.account@example.com',name:'Clean Account',consent:true,public_daily_brief:true,public_weekly_digest:true,release_notices:true,timezone:'Europe/Paris',path:'/newsletter.html'}});
assert(signup.response.status===202&&signup.data.ok&&signup.data.saved,'Signup endpoint did not persist and accept the clean account');
assert(signup.data.testVerificationToken,'Test verification token was not returned in explicit test mode');
assert(scalar(db,"SELECT COUNT(*) FROM members WHERE email='clean.account@example.com' AND status='pending' AND marketing_status='pending'")===1,'Pending D1 subscriber record missing');
assert(scalar(db,"SELECT COUNT(*) FROM email_consents WHERE member_id=(SELECT id FROM members WHERE email='clean.account@example.com') AND granted=1")===1,'Consent record missing');
assert(scalar(db,"SELECT COUNT(*) FROM email_provider_contacts WHERE member_id=(SELECT id FROM members WHERE email='clean.account@example.com') AND sync_status='synced'")===1,'Brevo contact synchronization was not recorded');
assert(providerCalls.some(call=>call.url.endsWith('/v3/contacts')),'Brevo contact endpoint was not called');
assert(providerCalls.some(call=>call.url.endsWith('/v3/smtp/email')&&call.payload.subject.includes('Verify')),'Verification email was not sent');
pass('signup-d1-provider-verification-delivery');

const verify=await call(`/api/email/verify?purpose=verify_marketing&token=${encodeURIComponent(signup.data.testVerificationToken)}`);
assert(verify.data.ok&&verify.data.verified,'Verification endpoint did not activate the account');
assert(verify.data.preferenceToken&&verify.data.unsubscribeToken,'Verification did not issue subscriber action tokens');
assert(scalar(db,"SELECT COUNT(*) FROM members WHERE email='clean.account@example.com' AND status='active' AND marketing_status='subscribed' AND email_verified_at IS NOT NULL")===1,'Verified D1 member state missing');
assert(providerCalls.some(call=>call.url.endsWith('/v3/smtp/email')&&call.payload.subject.includes('Welcome')),'Welcome sequence was not delivered');
assert(scalar(db,"SELECT COUNT(*) FROM email_segment_memberships WHERE member_id=(SELECT id FROM members WHERE email='clean.account@example.com') AND state='active'")>=3,'Daily, weekly and release segments were not activated');
pass('verification-welcome-segments');

const subscriber=await call(`/api/email/subscriber?token=${encodeURIComponent(verify.data.preferenceToken)}`);
assert(subscriber.data.ok&&subscriber.data.subscriber.marketingStatus==='subscribed','Subscriber dashboard API did not return the verified subscriber');
const preferenceSave=await call('/api/email/preferences',{method:'POST',body:{token:verify.data.preferenceToken,public_daily_brief:true,public_weekly_digest:true,release_notices:false,timezone:'Europe/Paris'}});
assert(preferenceSave.data.ok&&preferenceSave.data.saved,'Preference update failed');
assert(scalar(db,"SELECT release_notices FROM email_preferences WHERE member_id=(SELECT id FROM members WHERE email='clean.account@example.com')")===0,'Preference update was not persisted');
pass('subscriber-dashboard-preferences');

const campaign=await call('/api/email/admin/campaigns',{method:'POST',headers:adminHeaders,body:{kind:'daily',segmentKey:'public_daily_brief',subject:'Fixture Daily Control Brief',htmlContent:'<html><body><h1>Fixture daily</h1><p>Evidence boundary retained.</p></body></html>',textContent:'Fixture daily\nEvidence boundary retained.',sendNow:true,campaignKey:'fixture-daily-1'}});
assert(campaign.response.status===201&&campaign.data.ok,'Admin campaign creation failed');
assert(campaign.data.queued.recipientCount===1&&campaign.data.delivery.sent===1,'Daily segment did not queue and send exactly one eligible recipient');
const campaignId=campaign.data.campaign.id;
const deliveryRow=db.prepare('SELECT * FROM email_deliveries WHERE campaign_id=?').get(campaignId);
assert(deliveryRow&&deliveryRow.provider_message_id,'Campaign delivery row or provider message ID missing');
pass('daily-segment-campaign-send');

const deliveredWebhook=await call('/api/email/provider-webhook',{method:'POST',headers:{'x-email-webhook-secret':env.EMAIL_WEBHOOK_SECRET,'x-brevo-request-id':'fixture-webhook-delivered'},body:{event:'delivered',email:'clean.account@example.com','message-id':deliveryRow.provider_message_id,event_id:'fixture-event-delivered',date:'2026-07-13T12:01:00.000Z'}});
assert(deliveredWebhook.data.ok&&deliveredWebhook.data.processed===1,'Delivery webhook was not processed');
assert(scalar(db,'SELECT COUNT(*) FROM email_events WHERE provider_event_id=?','fixture-event-delivered')===1,'Delivery event was not recorded');
assert(scalar(db,'SELECT COUNT(*) FROM email_deliveries WHERE campaign_id=? AND status=?',campaignId,'delivered')===1,'Delivery status was not reconciled');
const duplicateWebhook=await call('/api/email/provider-webhook',{method:'POST',headers:{'x-email-webhook-secret':env.EMAIL_WEBHOOK_SECRET,'x-brevo-request-id':'fixture-webhook-delivered'},body:{event:'delivered',email:'clean.account@example.com','message-id':deliveryRow.provider_message_id,event_id:'fixture-event-delivered',date:'2026-07-13T12:01:00.000Z'}});
assert(duplicateWebhook.data.ok&&duplicateWebhook.data.duplicate===true,'Webhook request replay was not idempotently ignored');
pass('delivery-event-recording-idempotency');

const health=await call('/api/email/admin/health',{headers:adminHeaders});
const monitor=await call('/api/email/admin/campaigns',{headers:adminHeaders});
assert(health.data.ok&&health.data.d1Connected&&health.data.brevoConfigured&&health.data.automationEnabled,'Admin health monitoring is incomplete');
assert(monitor.data.ok&&monitor.data.campaigns.some(item=>item.id===campaignId),'Admin campaign monitoring did not show the campaign');
assert(fs.existsSync(path.join(root,'subscriber-dashboard.html'))&&fs.existsSync(path.join(root,'admin-campaign-monitor.html')),'Subscriber or admin dashboard page missing');
pass('subscriber-and-admin-dashboards');

const unsubscribe=await call(`/api/email/unsubscribe?token=${encodeURIComponent(verify.data.unsubscribeToken)}`);
assert(unsubscribe.data.ok&&unsubscribe.data.unsubscribed,'Unsubscribe endpoint failed');
assert(scalar(db,"SELECT COUNT(*) FROM members WHERE email='clean.account@example.com' AND marketing_status='unsubscribed'")===1,'Unsubscribe did not update member marketing state');
assert(scalar(db,"SELECT COUNT(*) FROM email_suppressions WHERE member_id=(SELECT id FROM members WHERE email='clean.account@example.com') AND active=1")===1,'Unsubscribe suppression missing');
const postUnsubscribeCampaign=await call('/api/email/admin/campaigns',{method:'POST',headers:adminHeaders,body:{kind:'daily',segmentKey:'public_daily_brief',subject:'Suppressed Fixture',htmlContent:'<html><body><p>Suppressed fixture campaign.</p></body></html>',textContent:'Suppressed fixture campaign.',sendNow:true,campaignKey:'fixture-daily-suppressed'}});
assert(postUnsubscribeCampaign.data.ok&&postUnsubscribeCampaign.data.queued.recipientCount===0,'Unsubscribed account remained eligible for a campaign');
pass('unsubscribe-immediate-suppression');

const resubscribe=await call('/api/email/resubscribe',{method:'POST',body:{email:'clean.account@example.com',name:'Clean Account',consent:true,public_daily_brief:true,public_weekly_digest:true,release_notices:true,path:'/subscriber-dashboard.html'}});
assert(resubscribe.response.status===202&&resubscribe.data.testVerificationToken,'Resubscribe request did not issue verification');
const resubscribeVerify=await call(`/api/email/verify?purpose=resubscribe&token=${encodeURIComponent(resubscribe.data.testVerificationToken)}`);
assert(resubscribeVerify.data.ok&&resubscribeVerify.data.verified,'Resubscribe verification failed');
assert(scalar(db,"SELECT COUNT(*) FROM email_suppressions WHERE member_id=(SELECT id FROM members WHERE email='clean.account@example.com') AND active=1")===0,'Explicit resubscribe consent did not clear suppression');
assert(scalar(db,"SELECT COUNT(*) FROM members WHERE email='clean.account@example.com' AND marketing_status='subscribed'")===1,'Resubscribe did not restore marketing state');
pass('explicit-resubscribe-lifecycle');

const scheduledPromises=[];
await worker.scheduled({cron:'5 6 * * *'},env,{waitUntil(promise){scheduledPromises.push(promise)}});
await Promise.all(scheduledPromises.splice(0));
await worker.scheduled({cron:'15 7 * * 1'},env,{waitUntil(promise){scheduledPromises.push(promise)}});
await Promise.all(scheduledPromises.splice(0));
assert(scalar(db,"SELECT COUNT(*) FROM email_campaigns WHERE campaign_key='automation:daily:2026-07-13'")===1,'Daily automated campaign was not created');
assert(scalar(db,"SELECT COUNT(*) FROM email_campaigns WHERE campaign_key='automation:weekly:2026-07-13'")===1,'Weekly automated campaign was not created');
assert(scalar(db,"SELECT COUNT(*) FROM email_outbox WHERE campaign_id IN (SELECT id FROM email_campaigns WHERE campaign_key LIKE 'automation:%') AND status='sent'")>=2,'Automated campaign sends were not completed');
pass('daily-weekly-automated-sends');

const latestCampaignDelivery=db.prepare("SELECT d.provider_message_id FROM email_deliveries d JOIN email_campaigns c ON c.id=d.campaign_id WHERE c.campaign_key='automation:daily:2026-07-13' LIMIT 1").get();
const bounce=await call('/api/email/provider-webhook',{method:'POST',headers:{'x-email-webhook-secret':env.EMAIL_WEBHOOK_SECRET,'x-brevo-request-id':'fixture-webhook-bounce'},body:{event:'hard_bounce',email:'clean.account@example.com','message-id':latestCampaignDelivery.provider_message_id,event_id:'fixture-event-bounce',date:'2026-07-13T12:02:00.000Z'}});
assert(bounce.data.ok&&bounce.data.suppressions===1,'Hard-bounce webhook did not suppress the subscriber');
assert(scalar(db,"SELECT COUNT(*) FROM members WHERE email='clean.account@example.com' AND marketing_status='bounced'")===1,'Bounce state was not recorded');
pass('bounce-complaint-suppression-path');

providerFailure=true;
const failedProviderSignup=await call('/newsletter-signup',{method:'POST',body:{email:'provider.failure@example.com',name:'Provider Failure',consent:true,public_weekly_digest:true,path:'/newsletter.html'}});
assert(failedProviderSignup.response.status===202&&failedProviderSignup.data.ok&&failedProviderSignup.data.saved,'Provider failure incorrectly lost the D1 subscriber record');
assert(failedProviderSignup.data.verification.sent===false&&failedProviderSignup.data.verification.retryQueued===true,'Provider failure did not queue a visible retry');
assert(scalar(db,"SELECT COUNT(*) FROM email_outbox WHERE member_id=(SELECT id FROM members WHERE email='provider.failure@example.com') AND status='retry'")===1,'Provider failure retry row missing');
providerFailure=false;
pass('provider-failure-no-false-success');

const finalHealth=await call('/api/email/admin/health',{headers:adminHeaders});
assert(finalHealth.data.ok,'Final admin health failed');
const result={
  ok:lifecycle.every(item=>item.passed),
  mode:'clean-account-end-to-end-fixture',
  generatedAt:'2026-07-13T12:00:00.000Z',
  cleanAccount:'clean.account@example.com',
  lifecycle,
  summary:{
    steps:lifecycle.length,
    passed:lifecycle.filter(item=>item.passed).length,
    members:Number(scalar(db,'SELECT COUNT(*) FROM members')),
    consentRecords:Number(scalar(db,'SELECT COUNT(*) FROM email_consents')),
    providerContacts:Number(scalar(db,'SELECT COUNT(*) FROM email_provider_contacts')),
    campaigns:Number(scalar(db,'SELECT COUNT(*) FROM email_campaigns')),
    deliveries:Number(scalar(db,'SELECT COUNT(*) FROM email_deliveries')),
    deliveryEvents:Number(scalar(db,'SELECT COUNT(*) FROM email_events')),
    suppressions:Number(scalar(db,'SELECT COUNT(*) FROM email_suppressions')),
    providerContactCalls:providerCalls.filter(call=>call.url.endsWith('/v3/contacts')).length,
    providerEmailCalls:providerCalls.filter(call=>call.url.endsWith('/v3/smtp/email')).length
  },
  protectedBoundaries:{cloudflareD1Mutation:false,liveBrevoMutation:false,liveEmailSend:false,paymentActivation:false,productionDeployment:false},
  boundary:'The complete lifecycle ran against an in-memory SQLite D1 adapter and a deterministic Brevo mock. No live subscriber, provider contact, email, campaign, payment or production deployment was changed.'
};
writeJson('lifecycle-test.json',result);
writeJson('steps.json',{ok:result.ok,recordCount:lifecycle.length,records:lifecycle});
writeJson('manifest.json',{ok:result.ok,mode:result.mode,generatedAt:result.generatedAt,fileHashes:{'lifecycle-test.json':hashFile(path.join(outputDir,'lifecycle-test.json')),'steps.json':hashFile(path.join(outputDir,'steps.json'))},...result.protectedBoundaries,boundary:result.boundary});
console.log(`PHASE 4 CLEAN ACCOUNT: ${result.summary.passed}/${result.summary.steps} lifecycle steps passed; ${result.summary.providerEmailCalls} provider email calls; ${result.summary.deliveryEvents} delivery events.`);
if(!result.ok)process.exit(1);
