const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

function fail(message) {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: message };
  fs.writeFileSync(path.join(reportDir, 'membership-foundation-patch-report.json'), JSON.stringify(report, null, 2));
  console.error(`Membership foundation patch failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(workerPath)) fail('src/worker.js missing');
let worker = fs.readFileSync(workerPath, 'utf8');
const beforeWorker = worker;

for (const marker of ['getSubscribers', 'handleNewsletterSignup', 'handleNewsletterHealth', 'handleNewsletterSubscribers', '/newsletter-signup']) {
  if (!worker.includes(marker)) fail(`Worker missing ${marker}`);
}

const storageFoundation = String.raw`function hasMembersDb(env){return Boolean(env&&env.MEMBERS_DB&&typeof env.MEMBERS_DB.prepare==='function')}
function consentGranted(v){return v===true||['1','true','yes','on'].includes(String(v||'').trim().toLowerCase())}
function secureEqual(a,b){a=String(a||'');b=String(b||'');if(!a||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function isAdminRequest(request,env){return Boolean(env&&env.ADMIN_API_TOKEN&&secureEqual(request.headers.get('x-admin-token')||'',env.ADMIN_API_TOKEN))}
async function d1First(statement){try{return await statement.first()}catch{return null}}
async function d1All(statement){try{const result=await statement.all();return Array.isArray(result&&result.results)?result.results:[]}catch{return[]}}
async function getSubscribers(env){if(hasMembersDb(env)){return d1All(env.MEMBERS_DB.prepare("SELECT id,email,display_name AS name,status,marketing_status,tier,source,email_verified_at,created_at,updated_at,last_login_at FROM members WHERE status <> 'deleted' ORDER BY created_at DESC LIMIT 5000"))}if(!env||!env.FORUM_POSTS)return[];const raw=await withTimeout(env.FORUM_POSTS.get('newsletter:index'),700,'[]');try{const arr=JSON.parse(raw||'[]');return Array.isArray(arr)?arr:[]}catch{return[]}}
async function persistMembershipSignup(env,input){const now=new Date().toISOString();const requestedId=subscriberId(input.email);const source=cleanText(input.source||'membership-signup',120);const wordingVersion=cleanText(input.wordingVersion||'membership-consent-v1',80);const sourcePage=cleanText(input.sourcePage||source,240);if(hasMembersDb(env)){try{await env.MEMBERS_DB.prepare("INSERT INTO members (id,email,display_name,role,tier,status,marketing_status,source,created_at,updated_at) VALUES (?,?,?,'member','free','pending','pending',?,?,?) ON CONFLICT(email) DO UPDATE SET display_name=CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE members.display_name END,status=CASE WHEN members.status='deleted' THEN members.status ELSE 'pending' END,marketing_status=CASE WHEN members.marketing_status='suppressed' THEN members.marketing_status ELSE 'pending' END,source=excluded.source,updated_at=excluded.updated_at").bind(requestedId,input.email,input.name,source,now,now).run();const row=await d1First(env.MEMBERS_DB.prepare("SELECT id,email,display_name AS name,status,marketing_status,tier,source,email_verified_at,created_at,updated_at FROM members WHERE email=? LIMIT 1").bind(input.email));if(!row||!row.id)return{saved:false,configured:true,persistent:true,storage:'Cloudflare D1 MEMBERS_DB',error:'member row could not be read after write'};const consentId='consent-'+row.id+'-'+Date.now();await env.MEMBERS_DB.prepare("INSERT INTO email_consents (id,member_id,consent_type,granted,wording_version,source_page,granted_at,created_at) VALUES (?,?,'marketing_email',1,?,?,?,?)").bind(consentId,row.id,wordingVersion,sourcePage,now,now).run();await env.MEMBERS_DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind('audit-'+row.id+'-'+Date.now(),row.id,'membership.signup','member',row.id,JSON.stringify({source,wordingVersion}),now).run();return{saved:true,configured:true,persistent:true,storage:'Cloudflare D1 MEMBERS_DB',member:row}}catch(error){return{saved:false,configured:true,persistent:true,storage:'Cloudflare D1 MEMBERS_DB',error:cleanText(error&&error.message,500)}}}if(env&&env.FORUM_POSTS){const member={id:requestedId,email:input.email,name:input.name,status:'pending',marketing_status:'pending',tier:'free',source,created_at:now,updated_at:now};const current=await getSubscribers(env);const next=[...current.filter(item=>item&&String(item.email||'').toLowerCase()!==input.email),member].slice(-5000);const memberSaved=Boolean(await withTimeout(env.FORUM_POSTS.put('newsletter:subscriber:'+requestedId,JSON.stringify(member),{metadata:{email:input.email,status:'pending',updatedAt:now}}).then(()=>true).catch(()=>false),1200,false));const indexSaved=Boolean(await withTimeout(env.FORUM_POSTS.put('newsletter:index',JSON.stringify(next),{metadata:{count:next.length,updatedAt:now}}).then(()=>true).catch(()=>false),1200,false));const consentSaved=Boolean(await withTimeout(env.FORUM_POSTS.put('newsletter:consent:'+requestedId+':'+Date.now(),JSON.stringify({memberId:requestedId,granted:true,wordingVersion,sourcePage,grantedAt:now}),{metadata:{memberId:requestedId,granted:true}}).then(()=>true).catch(()=>false),1200,false));return{saved:memberSaved&&indexSaved&&consentSaved,configured:true,persistent:true,storage:'Cloudflare KV FORUM_POSTS compatibility fallback',member}}return{saved:false,configured:false,persistent:false,storage:'not configured',error:'membership storage not configured'}}`;

const subscriberPattern = /async function getSubscribers\(env\)\{[\s\S]*?\}\nasync function handleNewsletterSignup/;
if (!subscriberPattern.test(worker)) fail('getSubscribers handler shape not recognized');
worker = worker.replace(subscriberPattern, storageFoundation + '\nasync function handleNewsletterSignup');

const signupHandler = String.raw`async function handleNewsletterSignup(request,env){const body=await readBody(request);const email=cleanText(body.email||'',240).toLowerCase();const name=cleanText(body.name||body.displayName||'',120);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,persistent:false,saved:false,error:'Valid email required'},400);if(!consentGranted(body.marketingConsent))return json({ok:false,persistent:false,saved:false,error:'Explicit email consent is required'},400);const result=await persistMembershipSignup(env,{email,name,source:body.source||'membership-signup',sourcePage:body.sourcePage||body.page||'',wordingVersion:body.consentVersion||'membership-consent-v1'});const member=result.member||null;return json({ok:result.saved,configured:result.configured,persistent:result.persistent,saved:result.saved,memberId:member&&member.id,member,status:result.saved?'pending-verification':'storage-error',storage:result.storage,message:result.saved?'Saved. Check your email when verification delivery is enabled.':'Member could not be persisted.',error:result.error||undefined},result.saved?202:result.configured?503:503)}`;
const signupPatterns = [
  /async function handleNewsletterSignup\(request,env\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/,
  /async function handleNewsletterSignup\(request, env\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/,
  /async function handleNewsletterSignup\(\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/
];
let signupReplaced = false;
for (const pattern of signupPatterns) {
  if (pattern.test(worker)) {
    worker = worker.replace(pattern, signupHandler + '\nasync function handleSubscribeNewsletter');
    signupReplaced = true;
    break;
  }
}
if (!signupReplaced) fail('newsletter signup handler shape not recognized');

worker = worker.replace(
  /async function handleNewsletterHealth\(env\)\{[\s\S]*?\}\nasync function handleNewsletterSubscribers/,
  "async function handleNewsletterHealth(env){const subscribers=await getSubscribers(env);const storage=hasMembersDb(env)?'Cloudflare D1 MEMBERS_DB':env&&env.FORUM_POSTS?'Cloudflare KV compatibility fallback':'not configured';const pending=subscribers.filter(item=>String(item.marketing_status||item.status||'').toLowerCase()==='pending').length;const subscribed=subscribers.filter(item=>String(item.marketing_status||'').toLowerCase()==='subscribed').length;return json({ok:hasMembersDb(env)||Boolean(env&&env.FORUM_POSTS),configured:hasMembersDb(env)||Boolean(env&&env.FORUM_POSTS),d1Connected:hasMembersDb(env),kvFallbackConnected:Boolean(env&&env.FORUM_POSTS),storage,members:subscribers.length,pending,subscribed,signup:'/api/membership/signup',updatedAt:new Date().toISOString()})}\nasync function handleNewsletterSubscribers"
);

worker = worker.replace(
  /async function handleNewsletterSubscribers\(request,env\)\{[\s\S]*?\}\nasync function handleNewsletterSendWeekly/,
  "async function handleNewsletterSubscribers(request,env){if(!env||!env.ADMIN_API_TOKEN)return json({ok:false,error:'Not found'},404);if(!isAdminRequest(request,env))return json({ok:false,error:'Forbidden'},403);const subscribers=await getSubscribers(env);return json({ok:true,count:subscribers.length,storage:hasMembersDb(env)?'Cloudflare D1 MEMBERS_DB':'Cloudflare KV compatibility fallback',subscribers})}\nasync function handleNewsletterSendWeekly"
);

worker = worker.replace(
  /async function handleUnsubscribeNewsletter\([^)]*\)\{[\s\S]*?\}\nasync function handleTrackEvent/,
  "async function handleUnsubscribeNewsletter(request,env){if(!env||!env.ADMIN_API_TOKEN||!isAdminRequest(request,env))return json({ok:false,error:'Secure unsubscribe links are not enabled yet'},501);const url=new URL(request.url);const email=cleanText(url.searchParams.get('email')||'',240).toLowerCase();if(!email)return json({ok:false,error:'Email required'},400);const now=new Date().toISOString();if(hasMembersDb(env)){await env.MEMBERS_DB.prepare(\"UPDATE members SET marketing_status='unsubscribed',updated_at=? WHERE email=?\").bind(now,email).run();return json({ok:true,status:'unsubscribed',storage:'Cloudflare D1 MEMBERS_DB'})}return json({ok:false,error:'D1 membership database not connected'},503)}\nasync function handleTrackEvent"
);

worker = worker.replace(
  "if(request.method==='POST'&&(originalPath==='/newsletter-signup'||originalPath==='/subscribe-newsletter'))return handleNewsletterSignup(request,env);",
  "if(request.method==='POST'&&(originalPath==='/newsletter-signup'||originalPath==='/subscribe-newsletter'||originalPath==='/api/membership/signup'))return handleNewsletterSignup(request,env);"
);
worker = worker.replace(
  "if(request.method==='GET'&&originalPath==='/newsletter-health')return handleNewsletterHealth(env);",
  "if(request.method==='GET'&&(originalPath==='/newsletter-health'||originalPath==='/api/membership/health'))return handleNewsletterHealth(env);"
);
worker = worker.replace(
  "if(request.method==='GET'&&originalPath==='/newsletter-subscribers.json')return handleNewsletterSubscribers(request,env);",
  "if(request.method==='GET'&&(originalPath==='/newsletter-subscribers.json'||originalPath==='/api/admin/members'))return handleNewsletterSubscribers(request,env);"
);

const required = [
  'env.MEMBERS_DB.prepare',
  "Cloudflare D1 MEMBERS_DB",
  "Explicit email consent is required",
  "originalPath==='/api/membership/signup'",
  "originalPath==='/api/membership/health'",
  "originalPath==='/api/admin/members'",
  'ADMIN_API_TOKEN',
  "status:'pending-verification'"
];
const missing = required.filter(marker => !worker.includes(marker));
if (missing.length) fail(`patched Worker missing membership marker(s): ${missing.join(', ')}`);
if (worker.includes("return json({ok:true,count:subscribers.length,subscribers})")) fail('public unprotected subscriber response still present');

if (worker !== beforeWorker) fs.writeFileSync(workerPath, worker);
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: worker !== beforeWorker,
  mode: 'D1-first membership foundation with KV compatibility fallback',
  publicSubscriberListLocked: true,
  required
};
fs.writeFileSync(path.join(reportDir, 'membership-foundation-patch-report.json'), JSON.stringify(report, null, 2));
console.log('Membership foundation patch OK: D1-first signup, consent records, protected member list and safe health route installed.');
