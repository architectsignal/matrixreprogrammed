import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd();
const outputDir=path.join(root,'downloads','phase5-auth-entitlement-test');
fs.rmSync(outputDir,{recursive:true,force:true});fs.mkdirSync(outputDir,{recursive:true});
const fixedNow='2026-07-13T12:00:00.000Z';
function assert(condition,message){if(!condition)throw new Error(message)}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value}
function write(name,value){fs.writeFileSync(path.join(outputDir,name),JSON.stringify(stable(value),null,2)+'\n')}
function scalar(db,sql,...args){const row=db.prepare(sql).get(...args);return row?Object.values(row)[0]:null}
function sha(value){return crypto.createHash('sha256').update(String(value)).digest('hex')}

class D1Statement{constructor(database,sql){this.database=database;this.sql=sql;this.args=[]}bind(...args){this.args=args;return this}async run(){const result=this.database.prepare(this.sql).run(...this.args);return{success:true,meta:{changes:Number(result.changes||0),last_row_id:result.lastInsertRowid?String(result.lastInsertRowid):null}}}async first(){return this.database.prepare(this.sql).get(...this.args)||null}async all(){return{success:true,results:this.database.prepare(this.sql).all(...this.args)}}}
class D1Database{constructor(database){this.database=database}prepare(sql){return new D1Statement(this.database,sql)}async batch(statements){const out=[];this.database.exec('BEGIN');try{for(const statement of statements)out.push(await statement.run());this.database.exec('COMMIT');return out}catch(error){this.database.exec('ROLLBACK');throw error}}}

const db=new DatabaseSync(':memory:');
db.exec(`
PRAGMA foreign_keys=ON;
CREATE TABLE members(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT,role TEXT NOT NULL DEFAULT 'member',tier TEXT NOT NULL DEFAULT 'free',status TEXT NOT NULL DEFAULT 'pending',marketing_status TEXT NOT NULL DEFAULT 'pending',source TEXT,email_verified_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_login_at TEXT);
CREATE TABLE magic_links(id TEXT PRIMARY KEY,member_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,purpose TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE TABLE member_sessions(id TEXT PRIMARY KEY,member_id TEXT NOT NULL,session_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,last_seen_at TEXT,revoked_at TEXT,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE TABLE subscriptions(id TEXT PRIMARY KEY,member_id TEXT NOT NULL,provider TEXT NOT NULL DEFAULT 'paypal',provider_customer_id TEXT,provider_subscription_id TEXT UNIQUE,provider_plan_id TEXT,tier TEXT NOT NULL,status TEXT NOT NULL,last_payment_at TEXT,next_billing_at TEXT,current_period_end TEXT,cancel_at_period_end INTEGER NOT NULL DEFAULT 0,suspended_at TEXT,cancelled_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
CREATE TABLE audit_log(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT NOT NULL,target_type TEXT,target_id TEXT,metadata_json TEXT,created_at TEXT NOT NULL);
`);
db.exec(fs.readFileSync(path.join(root,'migrations/phase5_member_experience.sql'),'utf8'));
const d1=new D1Database(db);

const memberSource=fs.readFileSync(path.join(root,'src/worker-member-experience.js'),'utf8');
const memberModule=await import(`data:text/javascript;base64,${Buffer.from(memberSource).toString('base64')}`);
const memberWorker=memberModule.default;
const legacySource=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const legacyModule=await import(`data:text/javascript;base64,${Buffer.from(legacySource).toString('base64')}`);
const legacyWorker=legacyModule.default;

const members=[
  ['member-registered','registered@example.com','Registered Reader','member','free'],
  ['member-supporter','supporter@example.com','Supporter Reader','member','supporter'],
  ['member-intelligence','intelligence@example.com','Intelligence Reader','member','free'],
  ['member-research','research@example.com','Research Reader','member','research_pro'],
  ['member-admin','admin@example.com','Administrator','admin','free']
];
for(const [id,email,name,role,tier] of members)db.prepare("INSERT INTO members(id,email,display_name,role,tier,status,marketing_status,source,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,'active','subscribed','fixture',?,?,?)").run(id,email,name,role,tier,fixedNow,fixedNow,fixedNow);
db.prepare("INSERT INTO subscriptions(id,member_id,provider,provider_subscription_id,provider_plan_id,tier,status,current_period_end,created_at,updated_at) VALUES ('sub-supporter','member-supporter','paypal','paypal-supporter','plan-supporter','supporter','active','2030-01-01T00:00:00.000Z',?,?)").run(fixedNow,fixedNow);
db.prepare("INSERT INTO subscriptions(id,member_id,provider,provider_subscription_id,provider_plan_id,tier,status,current_period_end,created_at,updated_at) VALUES ('sub-research','member-research','paypal','paypal-research','plan-research','research_pro','active','2030-01-01T00:00:00.000Z',?,?)").run(fixedNow,fixedNow);
db.prepare("INSERT INTO member_access_grants(id,member_id,tier,source,status,starts_at,expires_at,reason,created_at,updated_at) VALUES ('grant-intelligence','member-intelligence','intelligence','manual','active','2026-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z','Fixture intelligence grant',?,?)").run(fixedNow,fixedNow);
db.prepare("INSERT INTO member_product_grants(id,member_id,product_key,source,status,starts_at,expires_at,created_at,updated_at) VALUES ('product-registered','member-registered','product-black-file','manual','active','2026-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z',?,?)").run(fixedNow,fixedNow);

const rawTokens={};
for(const [id] of members){const raw=`token-${id}`;rawTokens[id]=raw;db.prepare('INSERT INTO member_sessions(id,member_id,session_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(`session-${id}`,id,sha(raw),'2030-01-01T00:00:00.000Z',fixedNow,fixedNow)}
db.prepare('INSERT INTO member_sessions(id,member_id,session_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run('session-registered-second','member-registered',sha('token-registered-second'),'2030-01-01T00:00:00.000Z',fixedNow,fixedNow);

const archiveRows=[
  ['archive-registered','record-public','brief','Registered archive','Public archive summary','/public-archive.html','registered',null,'A',null],
  ['archive-supporter','record-supporter','weekly','Supporter archive','Supporter archive summary','/supporter-archive.html','supporter_3',null,'A',null],
  ['archive-intelligence','record-intelligence','intelligence','Intelligence archive','Detailed intelligence summary','/intelligence-archive.html','intelligence_6','supported_inference','B','speculative'],
  ['archive-research','record-research','dossier','Research archive','Research dossier summary','/research-archive.html','research_pro_9','scenario_analysis','B','speculative scenario analysis']
];
for(const row of archiveRows)db.prepare("INSERT INTO member_archive_entries(id,canonical_id,content_type,title,summary,route,minimum_tier,claim_class,evidence_grade,speculative_label,publication_status,published_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'published',?,?)").run(...row,fixedNow,fixedNow);
const downloads=[
  ['download-registered','Registered PDF','Registered file','registered.pdf','registered.pdf','application/pdf','registered',null],
  ['download-supporter','Supporter PDF','Supporter file','supporter.pdf','supporter.pdf','application/pdf','supporter_3',null],
  ['download-intelligence','Intelligence CSV','Intelligence file','intelligence.csv','intelligence.csv','text/csv','intelligence_6',null],
  ['download-research','Research JSON','Research file','research.json','research.json','application/json','research_pro_9',null],
  ['download-product','Black File product','Product file','black-file.pdf','black-file.pdf','application/pdf','separate_product','product-black-file']
];
for(const row of downloads)db.prepare('INSERT INTO member_download_catalog(id,title,description,storage_key,file_name,mime_type,minimum_tier,product_key,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)').run(...row,fixedNow,fixedNow);
const assets={async get(key){if(!downloads.some(row=>row[3]===key))return null;return{body:new TextEncoder().encode(`protected:${key}`),httpEtag:`etag-${key}`}}};
const env={MEMBERS_DB:d1,MEMBER_ASSETS:assets,BREVO_API_KEY:'fixture-brevo',MEMBERS_FROM_EMAIL:'members@matrixreprogrammed.com',MEMBERS_FROM_NAME:'Matrix Reprogrammed'};

const providerCalls=[];let lastAuthLink='';const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{if(String(url).includes('api.brevo.com/v3/smtp/email')){const payload=JSON.parse(options.body||'{}');providerCalls.push(payload);lastAuthLink=(payload.textContent||'').match(/https?:\/\/[^\s]+/)?.[0]||'';return new Response(JSON.stringify({messageId:'auth-message-fixture'}),{status:201,headers:{'content-type':'application/json'}})}return realFetch(url,options)};

async function memberCall(pathname,{memberId,method='GET',body}={}){const headers={accept:'application/json'};if(memberId)headers.cookie=`matrix_session=${encodeURIComponent(rawTokens[memberId])}`;if(body)headers['content-type']='application/json';const request=new Request(`https://matrixreprogrammed.com${pathname}`,{method,headers,body:body?JSON.stringify(body):undefined});const response=await memberWorker.fetch(request,env,{});const text=await response.text();let data;try{data=JSON.parse(text||'{}')}catch{data=text}return{response,data,text}}
async function legacyCall(pathname,{memberId,method='GET',body}={}){const headers={accept:'application/json'};if(memberId)headers.cookie=`matrix_session=${encodeURIComponent(rawTokens[memberId])}`;if(body)headers['content-type']='application/json';const request=new Request(`https://matrixreprogrammed.com${pathname}`,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual'});const response=await legacyWorker.fetch(request,env,{});const text=await response.text();let data;try{data=JSON.parse(text||'{}')}catch{data=text}return{response,data,text}}
function deniedSafe(result,status){assert(result.response.status===status,`Expected ${status}, received ${result.response.status}`);const forbidden=['body','html','content','storageKey','assetPath','providerReference','hiddenMetadata'];const encoded=JSON.stringify(result.data);for(const key of forbidden)assert(!encoded.includes(`"${key}"`),`Denied response leaked ${key}`)}
const stages=[];const pass=(name,details={})=>stages.push({name,passed:true,...details});

const anonymous=await memberCall('/api/member/dashboard');deniedSafe(anonymous,401);pass('anonymous-fails-closed');

const requestLink=await legacyCall('/api/auth/request-link',{method:'POST',body:{email:'registered@example.com'}});assert(requestLink.response.status===202&&requestLink.data.ok,'Passwordless request-link failed');assert(providerCalls.length===1&&lastAuthLink,'Passwordless email was not delivered');const authUrl=new URL(lastAuthLink);const verify=await legacyCall(authUrl.pathname+authUrl.search);assert(verify.response.status===303,'Passwordless verify did not redirect');const setCookie=verify.response.headers.get('set-cookie')||'';assert(setCookie.includes('matrix_session=')&&setCookie.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Lax'),'Secure session cookie flags missing');const replay=await legacyCall(authUrl.pathname+authUrl.search);assert(replay.response.status===303&&String(replay.response.headers.get('location')).includes('error='),'One-time login link was reusable');pass('passwordless-login-and-session-cookie');

const expectedTiers={
  'member-registered':'registered','member-supporter':'supporter_3','member-intelligence':'intelligence_6','member-research':'research_pro_9','member-admin':'registered'
};
for(const [memberId,expected] of Object.entries(expectedTiers)){const result=await memberCall('/api/member/dashboard',{memberId});assert(result.data.ok&&result.data.member.effectiveTier===expected,`${memberId} resolved to wrong tier`)}pass('effective-tier-resolution',expectedTiers);

const registeredSave=await memberCall('/api/member/saved',{memberId:'member-registered',method:'POST',body:{canonicalId:'public-record-1',title:'Public record',route:'/public-record.html',minimumTier:'registered'}});assert(registeredSave.response.status===201&&registeredSave.data.saved,'Registered save failed');const deniedSave=await memberCall('/api/member/saved',{memberId:'member-registered',method:'POST',body:{canonicalId:'intel-record-1',title:'Intelligence record',route:'/intelligence-record.html',minimumTier:'intelligence_6'}});deniedSafe(deniedSave,403);const topicFollow=await memberCall('/api/member/follows',{memberId:'member-registered',method:'POST',body:{entityId:'topic-identity',entityType:'topic',label:'Digital identity',route:'/policy-watch.html'}});assert(topicFollow.data.followed,'Registered topic follow failed');const entityDenied=await memberCall('/api/member/follows',{memberId:'member-registered',method:'POST',body:{entityId:'entity-example',entityType:'entity',label:'Example entity',route:'/entities.html'}});deniedSafe(entityDenied,403);const watchDenied=await memberCall('/api/member/watchlists',{memberId:'member-registered'});deniedSafe(watchDenied,403);pass('registered-capabilities-and-denials');

const supporterArchive=await memberCall('/api/member/archive',{memberId:'member-supporter'});assert(supporterArchive.data.entries.length===2&&supporterArchive.data.entries.every(item=>['registered','supporter_3'].includes(item.minimumTier)),'Supporter archive leaked higher tiers');const supporterWatch=await memberCall('/api/member/watchlists',{memberId:'member-supporter'});deniedSafe(supporterWatch,403);pass('supporter-cumulative-access');

const entityFollow=await memberCall('/api/member/follows',{memberId:'member-intelligence',method:'POST',body:{entityId:'entity-example',entityType:'entity',label:'Example entity',route:'/entities.html'}});assert(entityFollow.data.followed&&entityFollow.data.minimumTier==='intelligence_6','Intelligence entity follow failed');const basicWatch=await memberCall('/api/member/watchlists',{memberId:'member-intelligence',method:'POST',body:{targetId:'policy-example',targetType:'policy',label:'Policy example',route:'/policy-watch.html',criteria:{}}});assert(basicWatch.response.status===201&&basicWatch.data.minimumTier==='intelligence_6','Intelligence watch failed');const advancedDenied=await memberCall('/api/member/watchlists',{memberId:'member-intelligence',method:'POST',body:{targetId:'policy-advanced',targetType:'policy',label:'Advanced policy',route:'/policy-watch.html',criteria:{threshold:3}}});deniedSafe(advancedDenied,403);const intelligenceArchive=await memberCall('/api/member/archive',{memberId:'member-intelligence'});assert(intelligenceArchive.data.entries.length===3&&intelligenceArchive.data.entries.some(item=>item.speculativeLabel==='speculative'),'Intelligence archive missing labelled speculation');pass('intelligence-capabilities-and-speculation-label');

const advancedWatch=await memberCall('/api/member/watchlists',{memberId:'member-research',method:'POST',body:{targetId:'jurisdiction-advanced',targetType:'jurisdiction',label:'Advanced jurisdiction',route:'/authority-hub.html',criteria:{threshold:4,jurisdictions:['EU']}}});assert(advancedWatch.response.status===201&&advancedWatch.data.minimumTier==='research_pro_9','Research Pro advanced watch failed');const researchArchive=await memberCall('/api/member/archive',{memberId:'member-research'});assert(researchArchive.data.entries.length===4&&researchArchive.data.entries.some(item=>item.speculativeLabel==='speculative scenario analysis'),'Research archive failed');pass('research-pro-capabilities');

for(const [memberId,allowedIds] of Object.entries({
  'member-registered':['download-registered','download-product'],
  'member-supporter':['download-registered','download-supporter'],
  'member-intelligence':['download-registered','download-supporter','download-intelligence'],
  'member-research':['download-registered','download-supporter','download-intelligence','download-research']
})){const list=await memberCall('/api/member/downloads',{memberId});const ids=list.data.downloads.map(item=>item.id).sort();assert(JSON.stringify(ids)===JSON.stringify(allowedIds.sort()),`${memberId} download list mismatch: ${ids.join(',')}`)}
const allowedDownload=await memberCall('/api/member/downloads/download-intelligence',{memberId:'member-intelligence'});assert(allowedDownload.response.status===200&&allowedDownload.text.includes('protected:intelligence.csv'),'Allowed protected download failed');const deniedDownload=await memberCall('/api/member/downloads/download-research',{memberId:'member-intelligence'});deniedSafe(deniedDownload,403);assert(!deniedDownload.text.includes('research.json'),'Denied download leaked storage key');const productAllowed=await memberCall('/api/member/downloads/download-product',{memberId:'member-registered'});assert(productAllowed.response.status===200,'Explicit product grant did not work');const productDenied=await memberCall('/api/member/downloads/download-product',{memberId:'member-research'});deniedSafe(productDenied,403);pass('download-entitlement-and-product-isolation');

const sessions=await memberCall('/api/member/sessions',{memberId:'member-registered'});assert(sessions.data.sessions.filter(item=>item.active).length>=2,'Registered session list missing active sessions');const revokeOthers=await memberCall('/api/member/sessions/revoke-others',{memberId:'member-registered',method:'POST'});assert(revokeOthers.data.revokedOthers&&scalar(db,"SELECT COUNT(*) FROM member_sessions WHERE member_id='member-registered' AND revoked_at IS NULL")===1,'Revoke-other-sessions failed');pass('session-controls');

const adminDenied=await memberCall('/api/member/admin/summary',{memberId:'member-research'});deniedSafe(adminDenied,403);const adminSummary=await memberCall('/api/member/admin/summary',{memberId:'member-admin'});assert(adminSummary.data.admin&&adminSummary.data.counts.members===5,'Admin summary failed');const createGrant=await memberCall('/api/member/admin/grants',{memberId:'member-admin',method:'POST',body:{memberId:'member-registered',tier:'supporter',reason:'Fixture upgrade',expiresAt:'2030-01-01T00:00:00.000Z'}});assert(createGrant.response.status===201&&createGrant.data.created,'Admin grant creation failed');const upgraded=await memberCall('/api/member/dashboard',{memberId:'member-registered'});assert(upgraded.data.member.effectiveTier==='supporter_3','Audited grant did not update effective entitlement');const grantId=createGrant.data.id;const revokeGrant=await memberCall(`/api/member/admin/grants/${encodeURIComponent(grantId)}`,{memberId:'member-admin',method:'DELETE'});assert(revokeGrant.data.revoked,'Admin grant revoke failed');const downgraded=await memberCall('/api/member/dashboard',{memberId:'member-registered'});assert(downgraded.data.member.effectiveTier==='registered','Revoked grant did not remove paid entitlement');pass('admin-dashboard-and-audited-grants');

assert(fs.existsSync(path.join(root,'member-dashboard.html'))&&fs.existsSync(path.join(root,'access-denied.html'))&&fs.existsSync(path.join(root,'admin-member-dashboard.html')),'Required dashboard surfaces missing');
assert(scalar(db,"SELECT COUNT(*) FROM member_download_events WHERE result='allowed'")>=2,'Allowed download events missing');assert(scalar(db,"SELECT COUNT(*) FROM member_download_events WHERE result='denied'")>=2,'Denied download events missing');assert(scalar(db,'SELECT COUNT(*) FROM audit_log')>=2,'Admin audit records missing');pass('audit-and-surface-coverage');

globalThis.fetch=realFetch;
const summary={
  ok:true,
  mode:'isolated-integration-test',
  generatedAt:fixedNow,
  stagesPassed:stages.length,
  requiredStages:11,
  membersTested:5,
  tiersTested:['anonymous','registered','supporter_3','intelligence_6','research_pro_9','admin'],
  passwordlessProviderCalls:providerCalls.length,
  savedItems:Number(scalar(db,'SELECT COUNT(*) FROM member_saved_items')||0),
  follows:Number(scalar(db,'SELECT COUNT(*) FROM member_entity_follows')||0),
  watchItems:Number(scalar(db,'SELECT COUNT(*) FROM member_watch_items')||0),
  downloadEvents:Number(scalar(db,'SELECT COUNT(*) FROM member_download_events')||0),
  deniedDownloadEvents:Number(scalar(db,"SELECT COUNT(*) FROM member_download_events WHERE result='denied'")||0),
  accessGrants:Number(scalar(db,'SELECT COUNT(*) FROM member_access_grants')||0),
  paymentActivation:false,
  productionMigrationExecution:false,
  boundary:'The test uses isolated in-memory member data, mocked Brevo delivery and mocked protected storage. It does not modify real members, sessions, subscriptions, grants or files.'
};
assert(stages.length===11,'Phase 5 test did not complete all 11 stages');
write('lifecycle.json',{ok:true,generatedAt:fixedNow,stages});write('summary.json',summary);write('manifest.json',{ok:true,generatedAt:fixedNow,files:['lifecycle.json','summary.json'],paymentActivation:false,productionMigrationExecution:false,boundary:summary.boundary});
console.log(`PHASE 5 AUTH AND ENTITLEMENT PASS: ${stages.length}/11 stages; ${summary.membersTested} member fixtures; ${summary.tiersTested.length} access classes.`);
console.log(`Output: ${outputDir}`);
